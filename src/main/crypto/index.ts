import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { ipcMain } from 'electron';
import { encrypt as aesEncrypt, decrypt as aesDecrypt } from './aes-gcm';
import { hkdf } from './hkdf';
import {
    generateUserIdentityKeyPair,
    generateDeviceIdentityKeyPair,
    generateSignedPreKey,
    generateOneTimePreKeys,
    generateUUID,
    generateX25519KeyPair,
    ed25519PrivateToX25519,
    ed25519PublicToX25519,
    x25519DH,
} from './identity';
import {
    encryptKeyBackup,
    decryptKeyBackup,
    encryptKeyBackupWithCachedKey,
    hasCachedBackupKey,
    clearCachedBackupKey,
} from './key-backup';
import {
    initE2eeTables,
    saveDeviceIdentity,
    getDeviceIdentity,
    getOwnerUserId,
    storePrivateKey,
    loadPrivateKey,
    loadPublicKey,
    hasE2eeKeys,
    deleteAllE2eeKeys,
    loadOneTimePreKeyIds,
    loadSignedPreKeyIds,
    saveSenderKey,
    loadSenderKey,
    loadAllSenderKeys,
    loadAllSenderKeysForSender,
    deleteSenderKeysForChannel,
    wipeIfDifferentUser,
} from './key-storage';
import {
    createSenderKey,
    exportSenderKeyDistribution,
    importSenderKeyDistribution,
    senderKeyEncrypt,
    senderKeyDecrypt,
    deserializeSenderKey,
} from './sender-keys';
import { deriveSearchKey, generateSearchTokens, generateSearchTrapdoor } from './sse';
import type { KeyBackupBundle, SenderKeyState } from './types';

const ONE_TIME_PREKEY_COUNT = 100;
const SIGNED_PREKEY_START_ID = 1;

export function initE2ee(): void {
    initE2eeTables();
    registerE2eeIpcHandlers();
}

function registerE2eeIpcHandlers(): void {
    ipcMain.handle('e2ee:isSetup', async (_event, serverId: number, userId?: number) => {
        return hasE2eeKeys(serverId, userId);
    });

    ipcMain.handle('e2ee:getDeviceId', async (_event, serverId: number, userId?: number) => {
        const identity = getDeviceIdentity(serverId, userId);
        return identity?.deviceId ?? null;
    });

    ipcMain.handle('e2ee:wipeForUserMismatch', async (_event, serverId: number, userId: number) => {
        return wipeIfDifferentUser(serverId, userId);
    });

    ipcMain.handle('e2ee:setup', async (_event, serverId: number, deviceName: string, userId?: number) => {
        deleteAllE2eeKeys(serverId);

        const userIdentity = generateUserIdentityKeyPair();

        const deviceIdentity = generateDeviceIdentityKeyPair(userIdentity.privateKey);

        const deviceId = generateUUID();

        const signedPreKey = generateSignedPreKey(deviceIdentity.privateKey, SIGNED_PREKEY_START_ID);

        const oneTimePreKeys = generateOneTimePreKeys(1, ONE_TIME_PREKEY_COUNT);

        storePrivateKey(serverId, 'user_identity', 'primary', userIdentity.privateKey, userIdentity.publicKey);

        storePrivateKey(serverId, 'device_identity', deviceId, deviceIdentity.privateKey, deviceIdentity.publicKey);

        storePrivateKey(
            serverId,
            'signed_prekey',
            String(signedPreKey.id),
            signedPreKey.keyPair.privateKey,
            signedPreKey.keyPair.publicKey,
            { timestamp: signedPreKey.timestamp },
        );

        for (const otpk of oneTimePreKeys) {
            storePrivateKey(
                serverId,
                'one_time_prekey',
                String(otpk.id),
                otpk.keyPair.privateKey,
                otpk.keyPair.publicKey,
            );
        }

        saveDeviceIdentity(serverId, deviceId, deviceName, userId);

        return {
            userIdentityKey: Buffer.from(userIdentity.publicKey).toString('base64'),
            deviceId,
            deviceName,
            deviceIdentityKey: Buffer.from(deviceIdentity.publicKey).toString('base64'),
            identitySignature: Buffer.from(deviceIdentity.signature).toString('base64'),
            signedPrekey: Buffer.from(signedPreKey.keyPair.publicKey).toString('base64'),
            signedPrekeyId: signedPreKey.id,
            signedPrekeySignature: Buffer.from(signedPreKey.signature).toString('base64'),
            oneTimePrekeys: oneTimePreKeys.map((otpk) => ({
                prekeyId: otpk.id,
                publicKey: Buffer.from(otpk.keyPair.publicKey).toString('base64'),
            })),
        };
    });

    ipcMain.handle('e2ee:setupDevice', async (_event, serverId: number, deviceName: string, userId?: number) => {
        const userIdentityPrivate = loadPrivateKey(serverId, 'user_identity', 'primary');
        const userIdentityPublic = loadPublicKey(serverId, 'user_identity', 'primary');

        if (!userIdentityPrivate || !userIdentityPublic) {
            throw new Error('User identity key not found. Restore from backup first.');
        }

        const deviceIdentity = generateDeviceIdentityKeyPair(userIdentityPrivate);
        const deviceId = generateUUID();

        const existingSpkIds = loadSignedPreKeyIds(serverId);
        const spkStartId = existingSpkIds.length > 0 ? Math.max(...existingSpkIds) + 1 : SIGNED_PREKEY_START_ID;
        const signedPreKey = generateSignedPreKey(deviceIdentity.privateKey, spkStartId);

        const existingOtpIds = loadOneTimePreKeyIds(serverId);
        const otpStartId = existingOtpIds.length > 0 ? Math.max(...existingOtpIds) + 1 : 1;
        const oneTimePreKeys = generateOneTimePreKeys(otpStartId, ONE_TIME_PREKEY_COUNT);

        storePrivateKey(serverId, 'device_identity', deviceId, deviceIdentity.privateKey, deviceIdentity.publicKey);

        storePrivateKey(
            serverId,
            'signed_prekey',
            String(signedPreKey.id),
            signedPreKey.keyPair.privateKey,
            signedPreKey.keyPair.publicKey,
            { timestamp: signedPreKey.timestamp },
        );

        for (const otpk of oneTimePreKeys) {
            storePrivateKey(
                serverId,
                'one_time_prekey',
                String(otpk.id),
                otpk.keyPair.privateKey,
                otpk.keyPair.publicKey,
            );
        }

        saveDeviceIdentity(serverId, deviceId, deviceName, userId);

        return {
            userIdentityKey: Buffer.from(userIdentityPublic).toString('base64'),
            deviceId,
            deviceName,
            deviceIdentityKey: Buffer.from(deviceIdentity.publicKey).toString('base64'),
            identitySignature: Buffer.from(deviceIdentity.signature).toString('base64'),
            signedPrekey: Buffer.from(signedPreKey.keyPair.publicKey).toString('base64'),
            signedPrekeyId: signedPreKey.id,
            signedPrekeySignature: Buffer.from(signedPreKey.signature).toString('base64'),
            oneTimePrekeys: oneTimePreKeys.map((otpk) => ({
                prekeyId: otpk.id,
                publicKey: Buffer.from(otpk.keyPair.publicKey).toString('base64'),
            })),
        };
    });

    ipcMain.handle('e2ee:getPublicKeys', async (_event, serverId: number) => {
        const userIdentityPublic = loadPublicKey(serverId, 'user_identity', 'primary');
        const deviceInfo = getDeviceIdentity(serverId);

        if (!userIdentityPublic || !deviceInfo) return null;

        const deviceIdentityPublic = loadPublicKey(serverId, 'device_identity', deviceInfo.deviceId);
        if (!deviceIdentityPublic) return null;

        return {
            userIdentityKey: Buffer.from(userIdentityPublic).toString('base64'),
            deviceIdentityKey: Buffer.from(deviceIdentityPublic).toString('base64'),
            deviceId: deviceInfo.deviceId,
        };
    });

    ipcMain.handle(
        'e2ee:encrypt',
        async (
            _event,
            params: {
                serverId: number;
                type: 'channel' | 'dm';
                targetId: number;
                plaintext: string;
            },
        ) => {
            const { serverId, type, targetId, plaintext } = params;
            const deviceInfo = getDeviceIdentity(serverId);
            if (!deviceInfo) throw new Error('Device not set up');

            const encoder = new TextEncoder();
            const plaintextBytes = encoder.encode(plaintext);

            const storageKey = type === 'dm' ? -targetId : targetId;
            return await encryptSenderKeyMessage(serverId, storageKey, deviceInfo.deviceId, plaintextBytes);
        },
    );

    ipcMain.handle(
        'e2ee:decrypt',
        async (
            _event,
            params: {
                serverId: number;
                payload: string;
                senderId: number;
                senderDeviceId: string;
                channelId?: number;
                dmGroupId?: number;
                messageId?: number;
            },
        ) => {
            const { serverId, payload, senderId, senderDeviceId, channelId, dmGroupId } = params;
            const parsed = JSON.parse(payload);
            const deviceInfo = getDeviceIdentity(serverId);
            if (!deviceInfo) throw new Error('Device not set up');

            if (parsed.type === 'sender_key') {
                const storageKey = dmGroupId ? -dmGroupId : (channelId ?? 0);
                return await decryptSenderKeyMessage(serverId, parsed, senderId, senderDeviceId, storageKey);
            }

            throw new Error(`Unknown message type: ${parsed.type}`);
        },
    );

    ipcMain.handle('e2ee:createSenderKey', async (_event, serverId: number, channelId: number) => {
        const deviceInfo = getDeviceIdentity(serverId);
        if (!deviceInfo) throw new Error('Device not set up');

        const existing = loadSenderKey(serverId, channelId, 'self', deviceInfo.deviceId);
        if (existing) {
            return exportSenderKeyDistribution(existing);
        }

        const distributionId = generateUUID();
        const senderKeyState = createSenderKey(distributionId);

        saveSenderKey(serverId, channelId, 'self', deviceInfo.deviceId, senderKeyState);

        return exportSenderKeyDistribution(senderKeyState);
    });

    ipcMain.handle(
        'e2ee:processSenderKeyDist',
        async (
            _event,
            params: {
                serverId: number;
                channelId: number;
                senderId: string;
                senderDeviceId: string;
                distribution: {
                    distributionId: string;
                    chainKey: string;
                    signingPublicKey: string;
                    chainIndex: number;
                };
            },
        ) => {
            const existing = loadSenderKey(
                params.serverId,
                params.channelId,
                params.senderId,
                params.senderDeviceId,
                params.distribution.distributionId,
            );
            if (
                existing &&
                existing.distributionId === params.distribution.distributionId &&
                existing.chainIndex >= params.distribution.chainIndex
            ) {
                return { success: true };
            }

            const state = importSenderKeyDistribution(params.distribution);
            saveSenderKey(params.serverId, params.channelId, params.senderId, params.senderDeviceId, state);
            return { success: true };
        },
    );

    ipcMain.handle('e2ee:backupKeys', async (_event, serverId: number, pin: string) => {
        const bundle = buildKeyBackupBundle(serverId);
        return await encryptKeyBackup(bundle, pin, serverId);
    });

    ipcMain.handle(
        'e2ee:restoreKeys',
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

            restoreKeysFromBundle(serverId, bundle);
            return { success: true };
        },
    );

    ipcMain.handle('e2ee:autoUpdateBackup', async (_event, serverId: number) => {
        if (!hasCachedBackupKey(serverId)) return null;
        const bundle = buildKeyBackupBundle(serverId);
        return await encryptKeyBackupWithCachedKey(bundle, serverId);
    });

    ipcMain.handle('e2ee:hasBackupKey', async (_event, serverId: number) => {
        return hasCachedBackupKey(serverId);
    });

    ipcMain.handle('e2ee:clearBackupKey', async (_event, serverId?: number) => {
        clearCachedBackupKey(serverId);
        return { success: true };
    });

    ipcMain.handle('e2ee:rotateSignedPreKey', async (_event, serverId: number) => {
        const deviceInfo = getDeviceIdentity(serverId);
        if (!deviceInfo) throw new Error('Device not set up');

        const deviceIdentityPrivate = loadPrivateKey(serverId, 'device_identity', deviceInfo.deviceId);
        if (!deviceIdentityPrivate) throw new Error('Device identity key not found');

        const existingSpkIds = loadSignedPreKeyIds(serverId);
        const newId = existingSpkIds.length > 0 ? Math.max(...existingSpkIds) + 1 : SIGNED_PREKEY_START_ID + 1;

        const signedPreKey = generateSignedPreKey(deviceIdentityPrivate, newId);

        storePrivateKey(
            serverId,
            'signed_prekey',
            String(signedPreKey.id),
            signedPreKey.keyPair.privateKey,
            signedPreKey.keyPair.publicKey,
            { timestamp: signedPreKey.timestamp },
        );

        return {
            deviceId: deviceInfo.deviceId,
            signedPrekey: Buffer.from(signedPreKey.keyPair.publicKey).toString('base64'),
            signedPrekeyId: signedPreKey.id,
            signedPrekeySignature: Buffer.from(signedPreKey.signature).toString('base64'),
        };
    });

    ipcMain.handle('e2ee:generatePreKeys', async (_event, serverId: number, count: number) => {
        const existingIds = loadOneTimePreKeyIds(serverId);
        const startId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;

        const preKeys = generateOneTimePreKeys(startId, count);

        for (const pk of preKeys) {
            storePrivateKey(serverId, 'one_time_prekey', String(pk.id), pk.keyPair.privateKey, pk.keyPair.publicKey);
        }

        return preKeys.map((pk) => ({
            prekeyId: pk.id,
            publicKey: Buffer.from(pk.keyPair.publicKey).toString('base64'),
        }));
    });

    ipcMain.handle('e2ee:wipe', async (_event, serverId: number) => {
        deleteAllE2eeKeys(serverId);
        clearCachedBackupKey(serverId);
        return { success: true };
    });

    ipcMain.handle('e2ee:invalidateChannelSenderKeys', async (_event, serverId: number, channelId: number) => {
        deleteSenderKeysForChannel(serverId, channelId);
        return { success: true };
    });

    ipcMain.handle(
        'e2ee:encryptSenderKeyDist',
        async (
            _event,
            params: {
                distribution: {
                    distributionId: string;
                    chainKey: string;
                    signingPublicKey: string;
                    chainIndex: number;
                };
                recipientDeviceIdentityKey: string;
            },
        ) => {
            const { distribution, recipientDeviceIdentityKey } = params;

            const recipientEd25519Pub = Uint8Array.from(Buffer.from(recipientDeviceIdentityKey, 'base64'));
            const recipientX25519Pub = ed25519PublicToX25519(recipientEd25519Pub);

            const ephemeral = generateX25519KeyPair();

            const dhResult = x25519DH(ephemeral.privateKey, recipientX25519Pub);

            const salt = new Uint8Array(32);
            const info = new TextEncoder().encode('LaradiscoSenderKeyDist');
            const aesKey = await hkdf(dhResult, salt, info, 32);

            const plaintext = new TextEncoder().encode(JSON.stringify(distribution));
            const { ciphertext, nonce } = await aesEncrypt(aesKey, plaintext);

            return {
                encryptedDistribution: Buffer.from(ciphertext).toString('base64'),
                ephemeralPublicKey: Buffer.from(ephemeral.publicKey).toString('base64'),
                nonce: Buffer.from(nonce).toString('base64'),
            };
        },
    );

    ipcMain.handle(
        'e2ee:decryptSenderKeyDist',
        async (
            _event,
            params: {
                serverId: number;
                encryptedDistribution: string;
                ephemeralPublicKey: string;
                nonce: string;
            },
        ) => {
            const { serverId, encryptedDistribution, ephemeralPublicKey, nonce } = params;

            const deviceInfo = getDeviceIdentity(serverId);
            if (!deviceInfo) throw new Error('Device not set up');

            const ephPub = Uint8Array.from(Buffer.from(ephemeralPublicKey, 'base64'));
            const ct = Uint8Array.from(Buffer.from(encryptedDistribution, 'base64'));
            const n = Uint8Array.from(Buffer.from(nonce, 'base64'));
            const salt = new Uint8Array(32);
            const info = new TextEncoder().encode('LaradiscoSenderKeyDist');

            const ourEd25519Private = loadPrivateKey(serverId, 'device_identity', deviceInfo.deviceId);
            if (ourEd25519Private) {
                try {
                    const ourX25519Private = ed25519PrivateToX25519(ourEd25519Private);
                    const dhResult = x25519DH(ourX25519Private, ephPub);
                    const aesKey = await hkdf(dhResult, salt, info, 32);
                    const plaintext = await aesDecrypt(aesKey, ct, n);
                    return JSON.parse(new TextDecoder().decode(plaintext));
                } catch (error) {
                    console.error(error);
                }
            }

            const legacyPrivate = loadPrivateKey(serverId, 'device_identity_legacy', 'restored');
            if (legacyPrivate) {
                const legacyX25519Private = ed25519PrivateToX25519(legacyPrivate);
                const dhResult = x25519DH(legacyX25519Private, ephPub);
                const aesKey = await hkdf(dhResult, salt, info, 32);
                const plaintext = await aesDecrypt(aesKey, ct, n);
                return JSON.parse(new TextDecoder().decode(plaintext));
            }

            throw new Error('Cannot decrypt sender key distribution: no matching device key');
        },
    );

    ipcMain.handle(
        'e2ee:generateSearchTokens',
        async (
            _event,
            params: {
                serverId: number;
                type: 'channel' | 'dm';
                targetId: number;
                plaintext: string;
            },
        ) => {
            const { serverId, type, targetId, plaintext } = params;
            const deviceInfo = getDeviceIdentity(serverId);
            if (!deviceInfo) throw new Error('Device not set up');

            const storageKey = type === 'dm' ? -targetId : targetId;
            const senderKeyState = loadSenderKey(serverId, storageKey, 'self', deviceInfo.deviceId);
            if (!senderKeyState || !senderKeyState.baseChainKey) {
                return [];
            }

            const conversationId = `${type}:${targetId}`;
            const searchKey = await deriveSearchKey(senderKeyState.baseChainKey, conversationId);
            return generateSearchTokens(searchKey, plaintext);
        },
    );

    ipcMain.handle(
        'e2ee:generateSearchTrapdoor',
        async (
            _event,
            params: {
                serverId: number;
                type: 'channel' | 'dm';
                targetId: number;
                query: string;
            },
        ) => {
            const { serverId, type, targetId, query } = params;
            const deviceInfo = getDeviceIdentity(serverId);
            if (!deviceInfo) throw new Error('Device not set up');

            const storageKey = type === 'dm' ? -targetId : targetId;
            const senderKeyState = loadSenderKey(serverId, storageKey, 'self', deviceInfo.deviceId);
            if (!senderKeyState || !senderKeyState.baseChainKey) {
                throw new Error('No sender key for this conversation. Cannot generate search trapdoor.');
            }

            const conversationId = `${type}:${targetId}`;
            const searchKey = await deriveSearchKey(senderKeyState.baseChainKey, conversationId);
            return generateSearchTrapdoor(searchKey, query);
        },
    );
}

async function encryptSenderKeyMessage(
    serverId: number,
    conversationKey: number,
    deviceId: string,
    plaintext: Uint8Array<ArrayBuffer>,
): Promise<string> {
    let senderKeyState = loadSenderKey(serverId, conversationKey, 'self', deviceId);

    if (!senderKeyState) {
        const distributionId = generateUUID();
        senderKeyState = createSenderKey(distributionId);
        saveSenderKey(serverId, conversationKey, 'self', deviceId, senderKeyState);
    }

    const message = await senderKeyEncrypt(senderKeyState, plaintext);

    saveSenderKey(serverId, conversationKey, 'self', deviceId, senderKeyState);

    const payload = {
        v: 1,
        type: 'sender_key',
        sender_device_id: deviceId,
        ct: Buffer.from(message.ciphertext).toString('base64'),
        nonce: Buffer.from(message.nonce).toString('base64'),
        sig: Buffer.from(message.signature).toString('base64'),
        dId: message.distributionId,
        ci: message.chainIndex,
        ts: Date.now(),
    };

    return JSON.stringify(payload);
}

async function decryptSenderKeyMessage(
    serverId: number,
    parsed: Record<string, unknown>,
    senderId: number,
    senderDeviceId: string,
    conversationKey: number,
): Promise<string> {
    const messageDistId = parsed.dId as string;

    const candidates: SenderKeyState[] = [];

    const exactMatch = loadSenderKey(serverId, conversationKey, String(senderId), senderDeviceId, messageDistId);
    if (exactMatch) candidates.push(exactMatch);

    const allKeys = loadAllSenderKeysForSender(serverId, conversationKey, String(senderId), senderDeviceId);
    for (const k of allKeys) {
        if (!candidates.some((c) => c.distributionId === k.distributionId)) {
            candidates.push(k);
        }
    }

    const deviceInfo = getDeviceIdentity(serverId);
    if (deviceInfo && senderDeviceId === deviceInfo.deviceId) {
        const selfKeys = loadAllSenderKeysForSender(serverId, conversationKey, 'self', senderDeviceId);
        for (const k of selfKeys) {
            if (!candidates.some((c) => c.distributionId === k.distributionId)) {
                candidates.push(k);
            }
        }
    }

    const ownerUserId = getOwnerUserId(serverId);
    if (ownerUserId !== null && senderId === ownerUserId) {
        const selfOldKeys = loadAllSenderKeysForSender(serverId, conversationKey, 'self', senderDeviceId);
        for (const k of selfOldKeys) {
            if (!candidates.some((c) => c.distributionId === k.distributionId)) {
                candidates.push(k);
            }
        }
    }

    if (candidates.length === 0) {
        throw new Error(`No sender key for user ${senderId} device ${senderDeviceId}. Need sender key distribution.`);
    }

    const ciphertext = Uint8Array.from(Buffer.from(parsed.ct as string, 'base64'));
    const nonce = Uint8Array.from(Buffer.from(parsed.nonce as string, 'base64'));
    const signature = Uint8Array.from(Buffer.from((parsed.sig as string) || '', 'base64'));

    const errors: Error[] = [];
    for (const senderKeyState of candidates) {
        try {
            const plaintext = await senderKeyDecrypt(senderKeyState, {
                ciphertext,
                nonce,
                signature,
                chainIndex: parsed.ci as number,
                distributionId: parsed.dId as string,
            });

            saveSenderKey(serverId, conversationKey, String(senderId), senderDeviceId, senderKeyState);

            return new TextDecoder().decode(plaintext);
        } catch (err) {
            errors.push(err instanceof Error ? err : new Error(String(err)));
        }
    }

    throw new Error(
        `No sender key for user ${senderId} device ${senderDeviceId}. Need sender key distribution. Errors: ${errors.map((e) => e.message).join('; ')}`,
    );
}

function buildKeyBackupBundle(serverId: number): KeyBackupBundle {
    const userIdentityPrivate = loadPrivateKey(serverId, 'user_identity', 'primary');
    const deviceInfo = getDeviceIdentity(serverId);

    if (!userIdentityPrivate || !deviceInfo) {
        throw new Error('E2EE keys not found — cannot create backup');
    }

    const deviceIdentityPrivate = loadPrivateKey(serverId, 'device_identity', deviceInfo.deviceId);
    if (!deviceIdentityPrivate) {
        throw new Error('Device identity key not found — cannot create backup');
    }

    const signedPreKeyIds = loadSignedPreKeyIds(serverId);
    const signedPreKeys: Array<{ id: number; privateKey: string }> = [];
    for (const id of signedPreKeyIds) {
        const pk = loadPrivateKey(serverId, 'signed_prekey', String(id));
        if (pk) {
            signedPreKeys.push({ id, privateKey: Buffer.from(pk).toString('base64') });
        }
    }

    const oneTimePreKeyIds = loadOneTimePreKeyIds(serverId);
    const oneTimePreKeys: Array<{ id: number; privateKey: string }> = [];
    for (const id of oneTimePreKeyIds) {
        const pk = loadPrivateKey(serverId, 'one_time_prekey', String(id));
        if (pk) {
            oneTimePreKeys.push({ id, privateKey: Buffer.from(pk).toString('base64') });
        }
    }

    const allSenderKeys = loadAllSenderKeys(serverId);
    const senderKeys = allSenderKeys.map((sk) => ({
        channelId: sk.channelId,
        userId: sk.userId,
        deviceId: sk.deviceId,
        distributionId: sk.distributionId,
        state: sk.serializedState,
    }));

    return {
        version: 2,
        userIdentityPrivateKey: Buffer.from(userIdentityPrivate).toString('base64'),
        deviceIdentityPrivateKey: Buffer.from(deviceIdentityPrivate).toString('base64'),
        sourceDeviceId: deviceInfo.deviceId,
        signedPreKeys,
        oneTimePreKeys,
        senderKeys,
    };
}

function restoreKeysFromBundle(serverId: number, bundle: KeyBackupBundle): void {
    deleteAllE2eeKeys(serverId);

    const userIdentityPrivate = Uint8Array.from(Buffer.from(bundle.userIdentityPrivateKey, 'base64'));
    const userIdentityPublic = ed25519.getPublicKey(userIdentityPrivate);
    storePrivateKey(serverId, 'user_identity', 'primary', userIdentityPrivate, userIdentityPublic);

    if (bundle.deviceIdentityPrivateKey) {
        try {
            const deviceIdentityPrivate = Uint8Array.from(Buffer.from(bundle.deviceIdentityPrivateKey, 'base64'));
            const deviceIdentityPublic = ed25519.getPublicKey(deviceIdentityPrivate);
            storePrivateKey(
                serverId,
                'device_identity_legacy',
                'restored',
                deviceIdentityPrivate,
                deviceIdentityPublic,
            );
        } catch {
            console.warn('Key restore: skipping corrupted device identity key');
        }
    }

    if (bundle.signedPreKeys && bundle.signedPreKeys.length > 0) {
        for (const spk of bundle.signedPreKeys) {
            try {
                const privKey = Uint8Array.from(Buffer.from(spk.privateKey, 'base64'));
                const pubKey = new Uint8Array(x25519.getPublicKey(privKey));
                storePrivateKey(serverId, 'signed_prekey', String(spk.id), privKey, pubKey);
            } catch {
                console.warn(`Key restore: skipping corrupted signed prekey ${spk.id}`);
            }
        }
    }

    if (bundle.oneTimePreKeys && bundle.oneTimePreKeys.length > 0) {
        for (const otp of bundle.oneTimePreKeys) {
            try {
                const privKey = Uint8Array.from(Buffer.from(otp.privateKey, 'base64'));
                const pubKey = new Uint8Array(x25519.getPublicKey(privKey));
                storePrivateKey(serverId, 'one_time_prekey', String(otp.id), privKey, pubKey);
            } catch {
                console.warn(`Key restore: skipping corrupted one-time prekey ${otp.id}`);
            }
        }
    }

    if (bundle.senderKeys && bundle.senderKeys.length > 0) {
        for (const sk of bundle.senderKeys) {
            if (!sk.state) continue;
            try {
                const state = deserializeSenderKey(sk.state);
                saveSenderKey(serverId, sk.channelId, sk.userId, sk.deviceId, state);
            } catch {
                console.warn(`Key restore: skipping corrupted sender key for channel ${sk.channelId}`);
            }
        }
    }
}
