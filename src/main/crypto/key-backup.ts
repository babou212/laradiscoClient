import { argon2id } from 'hash-wasm';
import { encrypt, decrypt } from './aes-gcm';
import type { KeyBackupBundle } from './types';

const ARGON2_PARAMS = {
    memory: 262144,
    iterations: 4,
    parallelism: 2,
    hashLength: 32,
};

const cachedBackupKeys = new Map<number, { key: Uint8Array<ArrayBuffer>; salt: Uint8Array<ArrayBuffer> }>();

export function cacheBackupKey(serverId: number, key: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>): void {
    cachedBackupKeys.set(serverId, { key: new Uint8Array(key), salt: new Uint8Array(salt) });
}

export function getCachedBackupKey(serverId: number): { key: Uint8Array<ArrayBuffer>; salt: Uint8Array<ArrayBuffer> } | null {
    return cachedBackupKeys.get(serverId) ?? null;
}

export function clearCachedBackupKey(serverId?: number): void {
    if (serverId != null) {
        cachedBackupKeys.delete(serverId);
    } else {
        cachedBackupKeys.clear();
    }
}

export function hasCachedBackupKey(serverId: number): boolean {
    return cachedBackupKeys.has(serverId);
}

async function deriveKeyFromPIN(
    pin: string,
    salt: Uint8Array<ArrayBuffer>,
    params = ARGON2_PARAMS,
): Promise<Uint8Array<ArrayBuffer>> {
    const hash = await argon2id({
        password: pin,
        salt,
        parallelism: params.parallelism,
        iterations: params.iterations,
        memorySize: params.memory,
        hashLength: params.hashLength,
        outputType: 'binary',
    });

    return new Uint8Array(hash);
}

export interface EncryptedKeyBackup {
    encryptedBundle: string;
    salt: string;
    nonce: string;
    argon2Params: {
        memory: number;
        iterations: number;
        parallelism: number;
    };
}

export async function encryptKeyBackup(bundle: KeyBackupBundle, pin: string, serverId?: number): Promise<EncryptedKeyBackup> {
    const bundleJson = JSON.stringify(bundle);
    const bundleBytes = new TextEncoder().encode(bundleJson);

    const salt = crypto.getRandomValues(new Uint8Array(32));

    const encryptionKey = await deriveKeyFromPIN(pin, salt);

    if (serverId != null) {
        cacheBackupKey(serverId, encryptionKey, salt);
    }

    const { ciphertext, nonce } = await encrypt(encryptionKey, bundleBytes);

    return {
        encryptedBundle: Buffer.from(ciphertext).toString('base64'),
        salt: Buffer.from(salt).toString('base64'),
        nonce: Buffer.from(nonce).toString('base64'),
        argon2Params: {
            memory: ARGON2_PARAMS.memory,
            iterations: ARGON2_PARAMS.iterations,
            parallelism: ARGON2_PARAMS.parallelism,
        },
    };
}

export async function decryptKeyBackup(backup: EncryptedKeyBackup, pin: string, serverId?: number): Promise<KeyBackupBundle | null> {
    try {
        const salt = new Uint8Array(Buffer.from(backup.salt, 'base64'));
        const encryptedBundle = new Uint8Array(Buffer.from(backup.encryptedBundle, 'base64'));
        const nonce = new Uint8Array(Buffer.from(backup.nonce, 'base64'));

        const backupParams = backup.argon2Params;
        const encryptionKey = await deriveKeyFromPIN(pin, salt, {
            memory: backupParams.memory,
            iterations: backupParams.iterations,
            parallelism: backupParams.parallelism,
            hashLength: ARGON2_PARAMS.hashLength,
        });

        const bundleBytes = await decrypt(encryptionKey, encryptedBundle, nonce);

        if (serverId != null) {
            cacheBackupKey(serverId, encryptionKey, salt);
        }

        const bundleJson = new TextDecoder().decode(bundleBytes);
        return JSON.parse(bundleJson) as KeyBackupBundle;
    } catch {
        return null;
    }
}

export async function encryptKeyBackupWithCachedKey(
    bundle: KeyBackupBundle,
    serverId: number,
): Promise<EncryptedKeyBackup | null> {
    const cached = getCachedBackupKey(serverId);
    if (!cached) return null;

    const bundleJson = JSON.stringify(bundle);
    const bundleBytes = new TextEncoder().encode(bundleJson);

    const { ciphertext, nonce } = await encrypt(cached.key, bundleBytes);

    return {
        encryptedBundle: Buffer.from(ciphertext).toString('base64'),
        salt: Buffer.from(cached.salt).toString('base64'),
        nonce: Buffer.from(nonce).toString('base64'),
        argon2Params: {
            memory: ARGON2_PARAMS.memory,
            iterations: ARGON2_PARAMS.iterations,
            parallelism: ARGON2_PARAMS.parallelism,
        },
    };
}
