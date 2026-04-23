import { ipcMain } from 'electron';
import { registerAutoBackupHandlers } from './auto-backup';
import {
    encryptKeyBackup,
    decryptKeyBackup,
    encryptKeyBackupWithCachedKey,
    hasCachedBackupKey,
    clearCachedBackupKey,
    verifyBackupIntegrity,
} from './backup';
import type { MlsKeyBackupBundle, E2eeDeviceKeys } from './backup';
import { MlsState } from './state';
import {
    hasIdentity,
    loadIdentity,
    deleteAllMlsState,
    wipeIfDifferentUser,
    saveIdentity,
    saveProviderState,
    snapshotProviderState,
    restoreProviderSnapshot,
} from './storage';
import { Provider, Identity, KeyPackage } from './wasm-loader';

const KEY_PACKAGE_BATCH_SIZE = 100;

interface StagedCommitInfo {
    added_identities?: string[];
    removed_indices?: number[];
    updated_identities?: string[];
}

function toBuffer(data: Uint8Array): Uint8Array<ArrayBuffer> {
    const buf = new ArrayBuffer(data.byteLength);
    const view = new Uint8Array(buf);
    view.set(data);
    return view;
}

function decodeIdentityBytes(bytes: Uint8Array): string {
    try {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        return decoder.decode(bytes);
    } catch {
        return 'hex:' + Buffer.from(bytes).toString('hex');
    }
}

function parseUserIdFromIdentity(identity: string): number | null {
    if (identity.startsWith('hex:')) return null;
    const idx = identity.indexOf(':');
    if (idx <= 0) return null;
    const userId = Number(identity.slice(0, idx));
    return Number.isFinite(userId) && Number.isInteger(userId) && userId > 0 ? userId : null;
}

function parseDeviceIdFromIdentity(identity: string): string | null {
    if (identity.startsWith('hex:')) return null;
    const idx = identity.indexOf(':');
    if (idx <= 0 || idx === identity.length - 1) return null;
    return identity.slice(idx + 1);
}

interface InspectedKp {
    identity: string;
    userId: number | null;
    deviceId: string | null;
}

function inspectKpBytes(keyPackageBytes: string): InspectedKp {
    const kpBytes = Uint8Array.from(Buffer.from(keyPackageBytes, 'base64'));
    const kp = KeyPackage.from_bytes(kpBytes);
    const idBytes = kp.credential_identity();
    const identity = decodeIdentityBytes(idBytes);
    const userId = parseUserIdFromIdentity(identity);
    const deviceId = parseDeviceIdFromIdentity(identity);
    return { identity, userId, deviceId };
}

function validateKpIdentity(keyPackageBytes: string, expectedUserId: number, expectedDeviceId: string): void {
    const { identity, userId, deviceId } = inspectKpBytes(keyPackageBytes);
    if (userId !== expectedUserId || deviceId !== expectedDeviceId) {
        throw new Error(
            `KeyPackage credential identity mismatch: expected ${expectedUserId}:${expectedDeviceId}, got ${identity}`,
        );
    }
}

class AsyncMutex {
    private _queue: Promise<void> = Promise.resolve();

    run<T>(fn: () => Promise<T>): Promise<T> {
        let resolve!: (v: T) => void;
        let reject!: (e: unknown) => void;
        const result = new Promise<T>((res, rej) => {
            resolve = res;
            reject = rej;
        });

        this._queue = this._queue.then(
            () => fn().then(resolve, reject),
            () => fn().then(resolve, reject),
        );

        return result;
    }
}

const serverMutexes = new Map<number, AsyncMutex>();

function getMutex(serverId: number): AsyncMutex {
    let mutex = serverMutexes.get(serverId);
    if (!mutex) {
        mutex = new AsyncMutex();
        serverMutexes.set(serverId, mutex);
    }
    return mutex;
}

async function withMlsLock<T>(serverId: number, fn: () => Promise<T>): Promise<T> {
    return getMutex(serverId).run(async () => {
        const snapshot = snapshotProviderState(serverId);
        try {
            return await fn();
        } catch (err) {
            if (err instanceof WebAssembly.RuntimeError) {
                console.error('[MLS] WASM trap detected, reverting to pre-op snapshot:', err.message);
                try {
                    restoreProviderSnapshot(serverId, snapshot);
                } catch (revertErr) {
                    console.error('[MLS] Failed to restore provider snapshot after trap:', revertErr);
                }
                stateCache.delete(serverId);
                const tagged = new Error(`MLS operation trapped and was rolled back: ${err.message}`);
                tagged.name = 'MlsTrapError';
                throw tagged;
            }
            throw err;
        }
    });
}

const stateCache = new Map<number, MlsState>();

function getState(serverId: number, userId?: number): MlsState {
    let state = stateCache.get(serverId);
    if (!state) {
        state = MlsState.init(serverId, userId);
        stateCache.set(serverId, state);
    }
    return state;
}

const dirtyServers = new Set<number>();

function markDirty(serverId: number): void {
    dirtyServers.add(serverId);
}

export function isDirty(serverId: number): boolean {
    return dirtyServers.has(serverId);
}

export function clearDirty(serverId: number): void {
    dirtyServers.delete(serverId);
}

export function getDirtyServerIds(): number[] {
    return Array.from(dirtyServers);
}

const e2eeDeviceKeysCache = new Map<number, E2eeDeviceKeys>();

export function setE2eeDeviceKeys(serverId: number, keys: E2eeDeviceKeys): void {
    e2eeDeviceKeysCache.set(serverId, keys);
}

export function getE2eeDeviceKeys(serverId: number): E2eeDeviceKeys | null {
    return e2eeDeviceKeysCache.get(serverId) ?? null;
}

function clearStateCache(serverId?: number): void {
    if (serverId != null) {
        stateCache.delete(serverId);
    } else {
        stateCache.clear();
    }
}

export function initMls(): void {
    registerMlsIpcHandlers();
    registerAutoBackupHandlers();
}

function registerMlsIpcHandlers(): void {
    ipcMain.handle('mls:isSetup', async (_event, serverId: number, userId?: number) => {
        return hasIdentity(serverId, userId);
    });

    ipcMain.handle('mls:getDeviceId', async (_event, serverId: number, userId?: number) => {
        const identity = loadIdentity(serverId, userId);
        return identity?.deviceId ?? null;
    });

    ipcMain.handle('mls:wipeForUserMismatch', async (_event, serverId: number, userId: number) => {
        const wiped = wipeIfDifferentUser(serverId, userId);
        if (wiped) clearStateCache(serverId);
        return wiped;
    });

    ipcMain.handle('mls:setup', async (_event, serverId: number, deviceName: string, userId?: number) => {
        return withMlsLock(serverId, async () => {
            clearStateCache(serverId);
            const state = getState(serverId);

            const deviceId = crypto.randomUUID();
            const identityName = `${userId ?? 'unknown'}:${deviceId}`;

            state.setup(deviceId, deviceName, identityName, userId);

            const keyPackages: Array<{ key_package_bytes: string; key_package_hash: string }> = [];
            for (let i = 0; i < KEY_PACKAGE_BATCH_SIZE; i++) {
                const kp = state.identity!.key_package(state.provider);
                const kpBytes = kp.to_bytes();
                const hashBuffer = await crypto.subtle.digest('SHA-256', toBuffer(kpBytes));
                const hash = Buffer.from(hashBuffer).toString('hex');
                keyPackages.push({
                    key_package_bytes: Buffer.from(kpBytes).toString('base64'),
                    key_package_hash: hash,
                });
            }

            const identityBytes = state.identity!.to_bytes();
            const identityHash = await crypto.subtle.digest('SHA-256', toBuffer(identityBytes));
            const identityKey = Buffer.from(identityHash).toString('hex');

            markDirty(serverId);

            return {
                deviceId,
                deviceName,
                identityBytes: Buffer.from(identityBytes).toString('base64'),
                identityKey,
                keyPackages,
            };
        });
    });

    ipcMain.handle('mls:setupDevice', async (_event, serverId: number, deviceName: string, userId?: number) => {
        let existingIdentity = loadIdentity(serverId, userId);
        if (!existingIdentity && userId != null) {
            existingIdentity = loadIdentity(serverId);
        }
        if (!existingIdentity) {
            throw new Error('MLS identity not found. Restore from backup first.');
        }

        return withMlsLock(serverId, async () => {
            clearStateCache(serverId);
            const state = getState(serverId, userId);

            const deviceId = crypto.randomUUID();
            state.restoreIdentity(existingIdentity.identityBytes, deviceId, deviceName, userId);

            const keyPackages: Array<{ key_package_bytes: string; key_package_hash: string }> = [];
            for (let i = 0; i < KEY_PACKAGE_BATCH_SIZE; i++) {
                const kp = state.identity!.key_package(state.provider);
                const kpBytes = kp.to_bytes();
                const hashBuffer = await crypto.subtle.digest('SHA-256', toBuffer(kpBytes));
                const hash = Buffer.from(hashBuffer).toString('hex');
                keyPackages.push({
                    key_package_bytes: Buffer.from(kpBytes).toString('base64'),
                    key_package_hash: hash,
                });
            }

            const idBuf = Buffer.from(existingIdentity.identityBytes);
            const identityHash = await crypto.subtle.digest('SHA-256', idBuf);
            const identityKey = Buffer.from(identityHash).toString('hex');

            return {
                deviceId,
                deviceName,
                identityBytes: idBuf.toString('base64'),
                identityKey,
                keyPackages,
            };
        });
    });

    ipcMain.handle(
        'mls:encrypt',
        async (
            _event,
            params: {
                serverId: number;
                groupId: string;
                plaintext: string;
            },
        ) => {
            const { serverId, groupId, plaintext } = params;
            return withMlsLock(serverId, async () => {
                const state = getState(serverId);
                if (!state.identity) throw new Error('MLS not set up');

                const group = state.loadGroup(groupId);
                if (!group) {
                    throw new Error(`MLS group "${groupId}" not found. Create or join it first.`);
                }

                const plaintextBytes = new TextEncoder().encode(plaintext);
                const encryptedBytes = group.create_message(state.provider, state.identity, plaintextBytes);

                state.persistProvider();
                markDirty(serverId);

                return {
                    message_bytes: Buffer.from(encryptedBytes).toString('base64'),
                    epoch: Number(group.epoch()),
                };
            });
        },
    );

    ipcMain.handle(
        'mls:decrypt',
        async (
            _event,
            params: {
                serverId: number;
                groupId: string;
                messageBytes: string;
            },
        ) => {
            const { serverId, groupId, messageBytes } = params;
            return withMlsLock(serverId, async () => {
                const state = getState(serverId);

                const group = state.loadGroup(groupId);
                if (!group) {
                    throw new Error(`MLS group "${groupId}" not found.`);
                }

                if (!messageBytes) {
                    throw new Error('messageBytes is required for decryption');
                }

                const bytes = Uint8Array.from(Buffer.from(messageBytes, 'base64'));
                const processed = group.process_message(state.provider, bytes);

                if (processed.msg_type !== 'application') {
                    // mls:decrypt is for application messages only. Commits/proposals
                    // must go through mls:processMessage where they are policy-validated.
                    if (group.has_pending_staged_commit()) {
                        group.discard_staged_commit();
                    }
                    state.persistProvider();
                    throw new Error(
                        `mls:decrypt rejected non-application message (msg_type=${processed.msg_type}). Use mls:processMessage for handshake messages.`,
                    );
                }

                state.persistProvider();

                return {
                    msgType: processed.msg_type,
                    payload: processed.payload ? new TextDecoder().decode(processed.payload) : null,
                };
            });
        },
    );

    ipcMain.handle('mls:createGroup', async (_event, params: { serverId: number; groupId: string }) => {
        const { serverId, groupId } = params;
        return withMlsLock(serverId, async () => {
            const state = getState(serverId);
            if (!state.identity) throw new Error('MLS not set up');

            const group = state.createGroup(groupId);

            markDirty(serverId);

            return {
                groupId,
                epoch: Number(group.epoch()),
                memberCount: group.members().length,
            };
        });
    });

    ipcMain.handle(
        'mls:joinGroup',
        async (
            _event,
            params: {
                serverId: number;
                welcomeBytes: string;
                ratchetTreeBytes: string;
            },
        ) => {
            const { serverId, welcomeBytes, ratchetTreeBytes } = params;
            return withMlsLock(serverId, async () => {
                const state = getState(serverId);

                const welcome = Uint8Array.from(Buffer.from(welcomeBytes, 'base64'));
                const rtBytes = Uint8Array.from(Buffer.from(ratchetTreeBytes, 'base64'));
                const group = state.joinGroup(welcome, rtBytes);

                const groupIdBytes = group.group_id();
                const groupId = new TextDecoder().decode(groupIdBytes);

                markDirty(serverId);

                return {
                    groupId,
                    epoch: Number(group.epoch()),
                    memberCount: group.members().length,
                };
            });
        },
    );

    ipcMain.handle(
        'mls:addMember',
        async (
            _event,
            params: {
                serverId: number;
                groupId: string;
                keyPackageBytes: string;
                expectedUserId: number;
                expectedDeviceId: string;
            },
        ) => {
            const { serverId, groupId, keyPackageBytes, expectedUserId, expectedDeviceId } = params;
            return withMlsLock(serverId, async () => {
                const state = getState(serverId);
                if (!state.identity) throw new Error('MLS not set up');

                const group = state.loadGroup(groupId);
                if (!group) throw new Error(`MLS group "${groupId}" not found.`);

                validateKpIdentity(keyPackageBytes, expectedUserId, expectedDeviceId);

                const kpBytes = Uint8Array.from(Buffer.from(keyPackageBytes, 'base64'));
                const kp = KeyPackage.from_bytes(kpBytes);

                const addMsgs = group.add_member(state.provider, state.identity, kp);

                state.persistProvider();
                markDirty(serverId);

                return {
                    commit: Buffer.from(addMsgs.commit).toString('base64'),
                    welcome: Buffer.from(addMsgs.welcome).toString('base64'),
                    epoch: Number(group.epoch()),
                };
            });
        },
    );

    ipcMain.handle(
        'mls:removeMember',
        async (
            _event,
            params: {
                serverId: number;
                groupId: string;
                leafIndices: number[];
            },
        ) => {
            const { serverId, groupId, leafIndices } = params;
            return withMlsLock(serverId, async () => {
                const state = getState(serverId);
                if (!state.identity) throw new Error('MLS not set up');

                const group = state.loadGroup(groupId);
                if (!group) throw new Error(`MLS group "${groupId}" not found.`);

                const removeMsgs = group.remove_members(state.provider, state.identity, new Uint32Array(leafIndices));

                state.persistProvider();
                markDirty(serverId);

                return {
                    commit: Buffer.from(removeMsgs.commit).toString('base64'),
                    epoch: Number(group.epoch()),
                };
            });
        },
    );

    ipcMain.handle(
        'mls:processMessage',
        async (
            _event,
            params: {
                serverId: number;
                groupId: string;
                messageBytes: string;
                allowedAddUserIds?: number[];
                allowedRemoveLeafIndices?: number[];
            },
        ) => {
            const { serverId, groupId, messageBytes, allowedAddUserIds, allowedRemoveLeafIndices } = params;
            return withMlsLock(serverId, async () => {
                const state = getState(serverId);

                const group = state.loadGroup(groupId);
                if (!group) throw new Error(`MLS group "${groupId}" not found.`);

                const bytes = Uint8Array.from(Buffer.from(messageBytes, 'base64'));
                const processed = group.process_message(state.provider, bytes);

                let stagedCommitInfo: StagedCommitInfo | null = null;

                if (processed.msg_type === 'commit') {
                    if (!group.has_pending_staged_commit()) {
                        throw new Error('Commit processed but no staged commit pending — wasm/host out of sync');
                    }

                    let parsed: StagedCommitInfo;
                    try {
                        parsed = JSON.parse(processed.staged_commit_json ?? '{}') as StagedCommitInfo;
                    } catch (err) {
                        group.discard_staged_commit();
                        state.persistProvider();
                        throw new Error(`Failed to parse staged commit info: ${(err as Error).message}`);
                    }

                    const allowedAdds = new Set(allowedAddUserIds ?? []);
                    const allowedRemoves = allowedRemoveLeafIndices ? new Set(allowedRemoveLeafIndices) : null;

                    const violations: string[] = [];

                    for (const idStr of parsed.added_identities ?? []) {
                        const userId = parseUserIdFromIdentity(idStr);
                        if (userId == null) {
                            violations.push(`unparseable added identity: ${idStr}`);
                            continue;
                        }
                        if (!allowedAdds.has(userId)) {
                            violations.push(`add userId=${userId} not in allowedAddUserIds`);
                        }
                    }

                    if (allowedRemoves) {
                        for (const idx of parsed.removed_indices ?? []) {
                            if (!allowedRemoves.has(idx)) {
                                violations.push(`remove leafIndex=${idx} not in allowedRemoveLeafIndices`);
                            }
                        }
                    }

                    if (violations.length > 0) {
                        group.discard_staged_commit();
                        state.persistProvider();
                        throw new Error(`MLS commit rejected by policy: ${violations.join('; ')}`);
                    }

                    group.approve_staged_commit(state.provider);
                    stagedCommitInfo = parsed;
                }

                state.persistProvider();
                markDirty(serverId);

                return {
                    msgType: processed.msg_type,
                    payload: processed.payload ? new TextDecoder().decode(processed.payload) : null,
                    epoch: Number(group.epoch()),
                    stagedCommit: stagedCommitInfo,
                };
            });
        },
    );

    ipcMain.handle('mls:inspectKeyPackage', async (_event, params: { keyPackageBytes: string }) => {
        return inspectKpBytes(params.keyPackageBytes);
    });

    ipcMain.handle('mls:selfUpdate', async (_event, params: { serverId: number; groupId: string }) => {
        const { serverId, groupId } = params;
        return withMlsLock(serverId, async () => {
            const state = getState(serverId);
            if (!state.identity) throw new Error('MLS not set up');

            const group = state.loadGroup(groupId);
            if (!group) throw new Error(`MLS group "${groupId}" not found.`);

            const updateMsgs = group.self_update(state.provider, state.identity);

            state.persistProvider();

            return {
                commit: Buffer.from(updateMsgs.commit).toString('base64'),
                welcome: updateMsgs.welcome ? Buffer.from(updateMsgs.welcome).toString('base64') : null,
                epoch: Number(group.epoch()),
            };
        });
    });

    ipcMain.handle('mls:mergeCommit', async (_event, params: { serverId: number; groupId: string }) => {
        const { serverId, groupId } = params;
        return withMlsLock(serverId, async () => {
            const state = getState(serverId);

            const group = state.loadGroup(groupId);
            if (!group) throw new Error(`MLS group "${groupId}" not found.`);

            group.merge_pending_commit(state.provider);

            const ratchetTree = group.export_ratchet_tree();

            state.persistProvider();
            markDirty(serverId);

            return {
                epoch: Number(group.epoch()),
                ratchetTree: Buffer.from(ratchetTree.to_bytes()).toString('base64'),
            };
        });
    });

    ipcMain.handle('mls:clearPendingCommit', async (_event, params: { serverId: number; groupId: string }) => {
        const { serverId, groupId } = params;
        return withMlsLock(serverId, async () => {
            const state = getState(serverId);

            const group = state.loadGroup(groupId);
            if (!group) throw new Error(`MLS group "${groupId}" not found.`);

            group.clear_pending_commit(state.provider);
            state.persistProvider();

            return { success: true };
        });
    });

    ipcMain.handle('mls:deleteGroup', async (_event, params: { serverId: number; groupId: string }) => {
        const { serverId, groupId } = params;
        return withMlsLock(serverId, async () => {
            const state = getState(serverId);

            const group = state.loadGroup(groupId);
            if (!group) return { success: false };

            group.delete(state.provider);
            state.persistProvider();

            return { success: true };
        });
    });

    ipcMain.handle('mls:generateKeyPackages', async (_event, serverId: number, count: number) => {
        return withMlsLock(serverId, async () => {
            const state = getState(serverId);
            if (!state.identity) throw new Error('MLS not set up');

            const keyPackages: Array<{ key_package_bytes: string; key_package_hash: string }> = [];
            for (let i = 0; i < count; i++) {
                const kp = state.identity.key_package(state.provider);
                const kpBytes = kp.to_bytes();
                const hashBuffer = await crypto.subtle.digest('SHA-256', toBuffer(kpBytes));
                const hash = Buffer.from(hashBuffer).toString('hex');
                keyPackages.push({
                    key_package_bytes: Buffer.from(kpBytes).toString('base64'),
                    key_package_hash: hash,
                });
            }

            state.persistProvider();

            return keyPackages;
        });
    });

    ipcMain.handle('mls:getGroupInfo', async (_event, params: { serverId: number; groupId: string }) => {
        const { serverId, groupId } = params;
        return withMlsLock(serverId, async () => {
            const state = getState(serverId);

            const group = state.loadGroup(groupId);
            if (!group) return null;

            return {
                groupId,
                epoch: Number(group.epoch()),
                isActive: group.is_active(),
                ownLeafIndex: group.own_leaf_index(),
                members: group
                    .members()
                    .map((m: { index: number; identity: Uint8Array; signature_key: Uint8Array }) => ({
                        index: m.index,
                        identity: decodeIdentityBytes(m.identity),
                        signatureKey: Buffer.from(m.signature_key).toString('base64'),
                    })),
            };
        });
    });

    ipcMain.handle('mls:backupKeys', async (_event, serverId: number, pin: string) => {
        return withMlsLock(serverId, async () => {
            const state = getState(serverId);
            if (!state.identity) throw new Error('MLS not set up');

            const bundle = buildBackupBundle(state, serverId);
            if (!verifyBackupIntegrity(bundle)) {
                throw new Error('Backup integrity check failed');
            }
            return await encryptKeyBackup(bundle, pin, serverId);
        });
    });

    ipcMain.handle(
        'mls:restoreKeys',
        async (
            _event,
            serverId: number,
            backup: {
                encryptedBundle: string;
                salt: string;
                nonce: string;
                argon2Params: { memory: number; iterations: number; parallelism: number };
            },
            pin: string,
            userId?: number,
        ) => {
            const bundle = await decryptKeyBackup(backup, pin, serverId);
            if (!bundle) return { success: false, error: 'Wrong PIN' };

            const result = restoreFromBundle(serverId, bundle, userId);
            clearStateCache(serverId);
            return {
                success: true,
                e2eeKeys: result.e2eeKeys,
                sourceDeviceId: result.sourceDeviceId,
                backupTimestamp: bundle.backupTimestamp,
            };
        },
    );

    ipcMain.handle('mls:autoUpdateBackup', async (_event, serverId: number) => {
        if (!hasCachedBackupKey(serverId)) return null;
        return withMlsLock(serverId, async () => {
            const state = getState(serverId);
            if (!state.identity) return null;

            const bundle = buildBackupBundle(state, serverId);
            const encrypted = await encryptKeyBackupWithCachedKey(bundle, serverId);
            if (encrypted) {
                clearDirty(serverId);
            }
            return encrypted;
        });
    });

    ipcMain.handle('mls:hasBackupKey', async (_event, serverId: number) => {
        return hasCachedBackupKey(serverId);
    });

    ipcMain.handle('mls:clearBackupKey', async (_event, serverId?: number) => {
        clearCachedBackupKey(serverId);
        return { success: true };
    });

    ipcMain.handle(
        'mls:changePIN',
        async (
            _event,
            serverId: number,
            backup: {
                encryptedBundle: string;
                salt: string;
                nonce: string;
                argon2Params: { memory: number; iterations: number; parallelism: number };
            },
            oldPin: string,
            newPin: string,
        ) => {
            const bundle = await decryptKeyBackup(backup, oldPin);
            if (!bundle) return { success: false, error: 'Wrong PIN' };

            const reEncrypted = await encryptKeyBackup(bundle, newPin, serverId);
            return { success: true, backup: reEncrypted };
        },
    );

    ipcMain.handle('mls:setE2eeDeviceKeys', async (_event, serverId: number, keys: E2eeDeviceKeys) => {
        setE2eeDeviceKeys(serverId, keys);
        markDirty(serverId);
        return { success: true };
    });

    ipcMain.handle('mls:isDirty', async (_event, serverId: number) => {
        return isDirty(serverId);
    });

    ipcMain.handle('mls:wipe', async (_event, serverId: number) => {
        deleteAllMlsState(serverId);
        clearStateCache(serverId);
        clearCachedBackupKey(serverId);
        return { success: true };
    });
}

function buildBackupBundle(state: MlsState, serverId: number): MlsKeyBackupBundle {
    if (!state.identity) throw new Error('MLS identity not set up');

    const identityBytes = state.identity.to_bytes();
    const providerBytes = state.provider.to_bytes();

    return {
        version: 4,
        mls: {
            identityBytes: Buffer.from(identityBytes).toString('base64'),
            providerBytes: Buffer.from(providerBytes).toString('base64'),
            sourceDeviceId: state.deviceId!,
        },
        e2ee: getE2eeDeviceKeys(serverId),
        backupTimestamp: new Date().toISOString(),
        deviceId: state.deviceId!,
    };
}

interface RestoreResult {
    e2eeKeys: E2eeDeviceKeys | null;
    sourceDeviceId: string;
}

function restoreFromBundle(serverId: number, bundle: MlsKeyBackupBundle, userId?: number): RestoreResult {
    if (bundle.version !== 4) {
        throw new Error(`Unsupported backup version: ${bundle.version}`);
    }
    if (!bundle.mls?.identityBytes) {
        throw new Error('Backup bundle is missing MLS identity bytes');
    }

    deleteAllMlsState(serverId);

    let provider: InstanceType<typeof Provider>;
    if (bundle.mls.providerBytes) {
        const providerBytes = Uint8Array.from(Buffer.from(bundle.mls.providerBytes, 'base64'));
        provider = Provider.from_bytes(providerBytes);
    } else {
        provider = new Provider();
    }

    const identityBytes = Uint8Array.from(Buffer.from(bundle.mls.identityBytes, 'base64'));
    Identity.from_bytes(provider, identityBytes);

    saveIdentity(serverId, bundle.mls.sourceDeviceId, 'restored', userId ?? null, identityBytes);
    saveProviderState(serverId, provider.to_bytes());

    if (bundle.e2ee) {
        setE2eeDeviceKeys(serverId, bundle.e2ee);
    }

    return {
        e2eeKeys: bundle.e2ee ?? null,
        sourceDeviceId: bundle.mls.sourceDeviceId,
    };
}
