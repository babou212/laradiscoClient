import { ipcMain } from 'electron';
import {
    encryptKeyBackup,
    decryptKeyBackup,
    encryptKeyBackupWithCachedKey,
    hasCachedBackupKey,
    clearCachedBackupKey,
} from './backup';
import type { MlsKeyBackupBundle } from './backup';
import { MlsState } from './state';
import {
    initMlsTables,
    hasIdentity,
    loadIdentity,
    deleteAllMlsState,
    wipeIfDifferentUser,
    saveIdentity,
    saveProviderState,
} from './storage';
import { Provider, Identity, KeyPackage } from './wasm-loader';

const KEY_PACKAGE_BATCH_SIZE = 100;

function toBuffer(data: Uint8Array): Uint8Array<ArrayBuffer> {
    const buf = new ArrayBuffer(data.byteLength);
    const view = new Uint8Array(buf);
    view.set(data);
    return view;
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

function clearStateCache(serverId?: number): void {
    if (serverId != null) {
        stateCache.delete(serverId);
    } else {
        stateCache.clear();
    }
}

export function initMls(): void {
    initMlsTables();
    registerMlsIpcHandlers();
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

        return {
            deviceId,
            deviceName,
            identityBytes: Buffer.from(identityBytes).toString('base64'),
            identityKey,
            keyPackages,
        };
    });

    ipcMain.handle('mls:setupDevice', async (_event, serverId: number, deviceName: string, userId?: number) => {
        const existingIdentity = loadIdentity(serverId, userId);
        if (!existingIdentity) {
            throw new Error('MLS identity not found. Restore from backup first.');
        }

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
            const state = getState(serverId);
            if (!state.identity) throw new Error('MLS not set up');

            const group = state.loadGroup(groupId);
            if (!group) {
                throw new Error(`MLS group "${groupId}" not found. Create or join it first.`);
            }

            const plaintextBytes = new TextEncoder().encode(plaintext);
            const encryptedBytes = group.create_message(state.provider, state.identity, plaintextBytes);

            state.persistProvider();

            return {
                message_bytes: Buffer.from(encryptedBytes).toString('base64'),
                epoch: Number(group.epoch()),
            };
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
            const state = getState(serverId);

            const group = state.loadGroup(groupId);
            if (!group) {
                throw new Error(`MLS group "${groupId}" not found.`);
            }

            const bytes = Uint8Array.from(Buffer.from(messageBytes, 'base64'));
            const processed = group.process_message(state.provider, bytes);

            state.persistProvider();

            return {
                msgType: processed.msg_type,
                payload: processed.payload ? new TextDecoder().decode(processed.payload) : null,
            };
        },
    );

    ipcMain.handle('mls:createGroup', async (_event, params: { serverId: number; groupId: string }) => {
        const { serverId, groupId } = params;
        const state = getState(serverId);
        if (!state.identity) throw new Error('MLS not set up');

        const group = state.createGroup(groupId);

        return {
            groupId,
            epoch: Number(group.epoch()),
            memberCount: group.members().length,
        };
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
            const state = getState(serverId);

            const welcome = Uint8Array.from(Buffer.from(welcomeBytes, 'base64'));
            const rtBytes = Uint8Array.from(Buffer.from(ratchetTreeBytes, 'base64'));
            const group = state.joinGroup(welcome, rtBytes);

            const groupIdBytes = group.group_id();
            const groupId = new TextDecoder().decode(groupIdBytes);

            return {
                groupId,
                epoch: Number(group.epoch()),
                memberCount: group.members().length,
            };
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
            },
        ) => {
            const { serverId, groupId, keyPackageBytes } = params;
            const state = getState(serverId);
            if (!state.identity) throw new Error('MLS not set up');

            const group = state.loadGroup(groupId);
            if (!group) throw new Error(`MLS group "${groupId}" not found.`);

            const kpBytes = Uint8Array.from(Buffer.from(keyPackageBytes, 'base64'));
            const kp = KeyPackage.from_bytes(kpBytes);

            const addMsgs = group.propose_and_commit_add(state.provider, state.identity, kp);

            const ratchetTree = group.export_ratchet_tree();

            state.persistProvider();

            return {
                proposal: Buffer.from(addMsgs.proposal).toString('base64'),
                commit: Buffer.from(addMsgs.commit).toString('base64'),
                welcome: Buffer.from(addMsgs.welcome).toString('base64'),
                ratchetTree: Buffer.from(ratchetTree.to_bytes()).toString('base64'),
                epoch: Number(group.epoch()),
            };
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
            const state = getState(serverId);
            if (!state.identity) throw new Error('MLS not set up');

            const group = state.loadGroup(groupId);
            if (!group) throw new Error(`MLS group "${groupId}" not found.`);

            const removeMsgs = group.remove_members(state.provider, state.identity, new Uint32Array(leafIndices));

            // Do NOT merge yet — caller must confirm with the server first.
            state.persistProvider();

            return {
                commit: Buffer.from(removeMsgs.commit).toString('base64'),
                epoch: Number(group.epoch()),
            };
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
            },
        ) => {
            const { serverId, groupId, messageBytes } = params;
            const state = getState(serverId);

            const group = state.loadGroup(groupId);
            if (!group) throw new Error(`MLS group "${groupId}" not found.`);

            const bytes = Uint8Array.from(Buffer.from(messageBytes, 'base64'));
            const processed = group.process_message(state.provider, bytes);

            state.persistProvider();

            return {
                msgType: processed.msg_type,
                payload: processed.payload ? new TextDecoder().decode(processed.payload) : null,
                epoch: Number(group.epoch()),
            };
        },
    );

    ipcMain.handle('mls:selfUpdate', async (_event, params: { serverId: number; groupId: string }) => {
        const { serverId, groupId } = params;
        const state = getState(serverId);
        if (!state.identity) throw new Error('MLS not set up');

        const group = state.loadGroup(groupId);
        if (!group) throw new Error(`MLS group "${groupId}" not found.`);

        const updateMsgs = group.self_update(state.provider, state.identity);

        // Do NOT merge yet — caller must confirm with the server first.
        state.persistProvider();

        return {
            commit: Buffer.from(updateMsgs.commit).toString('base64'),
            welcome: updateMsgs.welcome ? Buffer.from(updateMsgs.welcome).toString('base64') : null,
            epoch: Number(group.epoch()),
        };
    });

    ipcMain.handle('mls:mergeCommit', async (_event, params: { serverId: number; groupId: string }) => {
        const { serverId, groupId } = params;
        const state = getState(serverId);

        const group = state.loadGroup(groupId);
        if (!group) throw new Error(`MLS group "${groupId}" not found.`);

        group.merge_pending_commit(state.provider);
        state.persistProvider();

        return { epoch: Number(group.epoch()) };
    });

    ipcMain.handle('mls:clearPendingCommit', async (_event, params: { serverId: number; groupId: string }) => {
        const { serverId, groupId } = params;
        const state = getState(serverId);

        const group = state.loadGroup(groupId);
        if (!group) throw new Error(`MLS group "${groupId}" not found.`);

        group.clear_pending_commit(state.provider);
        state.persistProvider();

        return { success: true };
    });

    ipcMain.handle('mls:generateKeyPackages', async (_event, serverId: number, count: number) => {
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

    ipcMain.handle('mls:getGroupInfo', async (_event, params: { serverId: number; groupId: string }) => {
        const { serverId, groupId } = params;
        const state = getState(serverId);

        const group = state.loadGroup(groupId);
        if (!group) return null;

        return {
            groupId,
            epoch: Number(group.epoch()),
            isActive: group.is_active(),
            ownLeafIndex: group.own_leaf_index(),
            members: group.members().map((m: { index: number; identity: Uint8Array; signature_key: Uint8Array }) => ({
                index: m.index,
                identity: Buffer.from(m.identity).toString('utf8'),
                signatureKey: Buffer.from(m.signature_key).toString('base64'),
            })),
        };
    });

    ipcMain.handle(
        'mls:generateSearchTokens',
        async (
            _event,
            params: {
                serverId: number;
                conversationId: string;
                plaintext: string;
            },
        ) => {
            const { serverId, conversationId, plaintext } = params;
            const state = getState(serverId);
            if (!state.identity) throw new Error('MLS not set up');

            const searchKey = await deriveSearchKey(state.identity, conversationId);
            return generateSearchTokens(searchKey, plaintext);
        },
    );

    ipcMain.handle(
        'mls:generateSearchTrapdoor',
        async (
            _event,
            params: {
                serverId: number;
                conversationId: string;
                query: string;
            },
        ) => {
            const { serverId, conversationId, query } = params;
            const state = getState(serverId);
            if (!state.identity) throw new Error('MLS not set up');

            const searchKey = await deriveSearchKey(state.identity, conversationId);
            return generateSearchTrapdoor(searchKey, query);
        },
    );

    ipcMain.handle('mls:backupKeys', async (_event, serverId: number, pin: string) => {
        const state = getState(serverId);
        if (!state.identity) throw new Error('MLS not set up');

        const bundle = buildBackupBundle(state);
        return await encryptKeyBackup(bundle, pin, serverId);
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
        ) => {
            const bundle = await decryptKeyBackup(backup, pin, serverId);
            if (!bundle) return { success: false, error: 'Wrong PIN' };

            restoreFromBundle(serverId, bundle);
            clearStateCache(serverId);
            return { success: true };
        },
    );

    ipcMain.handle('mls:autoUpdateBackup', async (_event, serverId: number) => {
        if (!hasCachedBackupKey(serverId)) return null;
        const state = getState(serverId);
        if (!state.identity) return null;

        const bundle = buildBackupBundle(state);
        return await encryptKeyBackupWithCachedKey(bundle, serverId);
    });

    ipcMain.handle('mls:hasBackupKey', async (_event, serverId: number) => {
        return hasCachedBackupKey(serverId);
    });

    ipcMain.handle('mls:clearBackupKey', async (_event, serverId?: number) => {
        clearCachedBackupKey(serverId);
        return { success: true };
    });

    ipcMain.handle('mls:wipe', async (_event, serverId: number) => {
        deleteAllMlsState(serverId);
        clearStateCache(serverId);
        clearCachedBackupKey(serverId);
        return { success: true };
    });
}

function buildBackupBundle(state: MlsState): MlsKeyBackupBundle {
    if (!state.identity) throw new Error('MLS identity not set up');

    const identityBytes = state.identity.to_bytes();
    const providerBytes = state.provider.to_bytes();

    return {
        version: 3,
        identityBytes: Buffer.from(identityBytes).toString('base64'),
        providerBytes: Buffer.from(providerBytes).toString('base64'),
        sourceDeviceId: state.deviceId!,
    };
}

function restoreFromBundle(serverId: number, bundle: MlsKeyBackupBundle): void {
    if (bundle.version !== 3) {
        throw new Error(`Unsupported backup version: ${bundle.version}`);
    }
    if (!bundle.identityBytes) {
        throw new Error('Backup bundle is missing identity bytes');
    }

    deleteAllMlsState(serverId);

    let provider: InstanceType<typeof Provider>;
    if (bundle.providerBytes) {
        const providerBytes = Uint8Array.from(Buffer.from(bundle.providerBytes, 'base64'));
        provider = Provider.from_bytes(providerBytes);
    } else {
        provider = new Provider();
    }

    const identityBytes = Uint8Array.from(Buffer.from(bundle.identityBytes, 'base64'));
    Identity.from_bytes(provider, identityBytes);

    saveIdentity(serverId, bundle.sourceDeviceId, 'restored', null, identityBytes);
    saveProviderState(serverId, provider.to_bytes());
}

async function deriveSearchKey(identity: InstanceType<typeof Identity>, conversationId: string): Promise<Uint8Array> {
    const identityBytes = identity.to_bytes();
    const info = new TextEncoder().encode(`laradisco-sse-v2:${conversationId}`);
    const salt = new Uint8Array(32); // fixed zero salt

    const baseKey = await crypto.subtle.importKey('raw', toBuffer(identityBytes), 'HKDF', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, baseKey, 256);
    return new Uint8Array(bits);
}

const MAX_SEARCH_TOKENS = 500;

async function hmacToken(key: Uint8Array, data: string): Promise<string> {
    const cryptoKey = await crypto.subtle.importKey('raw', toBuffer(key), { name: 'HMAC', hash: 'SHA-256' }, false, [
        'sign',
    ]);
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
    return Buffer.from(sig).toString('hex');
}

async function generateSearchTokens(searchKey: Uint8Array, plaintext: string): Promise<string[]> {
    const normalized = plaintext
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .trim();
    const words = normalized.split(/\s+/).filter((w) => w.length >= 2);
    const tokens: string[] = [];

    for (const word of words) {
        for (let len = 2; len <= word.length && tokens.length < MAX_SEARCH_TOKENS; len++) {
            const substr = word.substring(0, len);
            tokens.push(await hmacToken(searchKey, substr));
        }
    }

    return tokens.slice(0, MAX_SEARCH_TOKENS);
}

async function generateSearchTrapdoor(searchKey: Uint8Array, query: string): Promise<string[]> {
    const normalized = query
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .trim();
    const words = normalized.split(/\s+/).filter((w) => w.length >= 2);
    const tokens: string[] = [];

    for (const word of words) {
        tokens.push(await hmacToken(searchKey, word));
    }

    return tokens;
}
