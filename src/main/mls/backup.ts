import { argon2id } from 'hash-wasm';

export interface MlsKeyBackupBundleV3 {
    version: 3;
    identityBytes: string;
    providerBytes: string;
    sourceDeviceId: string;
}

export interface E2eeDeviceKeys {
    deviceIdentityKey: string;
    identitySignature: string;
    signedPreKeyId: number;
    signedPreKey: string;
    signedPreKeySignature: string;
}

export interface MlsKeyBackupBundle {
    version: 4;
    mls: {
        identityBytes: string;
        providerBytes: string;
        sourceDeviceId: string;
    };
    e2ee: E2eeDeviceKeys | null;
    backupTimestamp: string;
    deviceId: string;
}

export type AnyBackupBundle = MlsKeyBackupBundleV3 | MlsKeyBackupBundle;

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

const ARGON2_PARAMS = {
    memory: 262144,
    iterations: 4,
    parallelism: 2,
    hashLength: 32,
};

const cachedBackupKeys = new Map<number, { key: Uint8Array; salt: Uint8Array }>();

export function cacheBackupKey(serverId: number, key: Uint8Array, salt: Uint8Array): void {
    cachedBackupKeys.set(serverId, { key: new Uint8Array(key), salt: new Uint8Array(salt) });
}

export function getCachedBackupKey(serverId: number): { key: Uint8Array; salt: Uint8Array } | null {
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

async function deriveKeyFromPIN(pin: string, salt: Uint8Array, params = ARGON2_PARAMS): Promise<Uint8Array> {
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

async function aesGcmEncrypt(
    key: Uint8Array,
    plaintext: Uint8Array,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const keyBuf = key as Uint8Array<ArrayBuffer>;
    const cryptoKey = await crypto.subtle.importKey('raw', keyBuf, { name: 'AES-GCM', length: 256 }, false, [
        'encrypt',
    ]);
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce },
        cryptoKey,
        plaintext as Uint8Array<ArrayBuffer>,
    );
    return { ciphertext: new Uint8Array(encrypted), nonce };
}

async function aesGcmDecrypt(key: Uint8Array, ciphertext: Uint8Array, nonce: Uint8Array): Promise<Uint8Array> {
    const keyBuf = key as Uint8Array<ArrayBuffer>;
    const cryptoKey = await crypto.subtle.importKey('raw', keyBuf, { name: 'AES-GCM', length: 256 }, false, [
        'decrypt',
    ]);
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce as Uint8Array<ArrayBuffer> },
        cryptoKey,
        ciphertext as Uint8Array<ArrayBuffer>,
    );
    return new Uint8Array(decrypted);
}

/** Migrate a v3 bundle to v4 format. */
export function migrateV3ToV4(v3: MlsKeyBackupBundleV3): MlsKeyBackupBundle {
    return {
        version: 4,
        mls: {
            identityBytes: v3.identityBytes,
            providerBytes: v3.providerBytes,
            sourceDeviceId: v3.sourceDeviceId,
        },
        e2ee: null,
        backupTimestamp: new Date().toISOString(),
        deviceId: v3.sourceDeviceId,
    };
}

export async function encryptKeyBackup(
    bundle: MlsKeyBackupBundle,
    pin: string,
    serverId?: number,
): Promise<EncryptedKeyBackup> {
    if (!pin || pin.length < 6) {
        throw new Error('PIN must be at least 6 characters');
    }

    const bundleBytes = new TextEncoder().encode(JSON.stringify(bundle));
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const encryptionKey = await deriveKeyFromPIN(pin, salt);

    if (serverId != null) {
        cacheBackupKey(serverId, encryptionKey, salt);
    }

    const { ciphertext, nonce } = await aesGcmEncrypt(encryptionKey, bundleBytes);

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

export async function decryptKeyBackup(
    backup: EncryptedKeyBackup,
    pin: string,
    serverId?: number,
): Promise<MlsKeyBackupBundle | null> {
    if (!pin || pin.length < 6) {
        return null;
    }

    try {
        const salt = new Uint8Array(Buffer.from(backup.salt, 'base64'));
        const encryptedBundle = new Uint8Array(Buffer.from(backup.encryptedBundle, 'base64'));
        const nonce = new Uint8Array(Buffer.from(backup.nonce, 'base64'));

        const encryptionKey = await deriveKeyFromPIN(pin, salt, {
            memory: backup.argon2Params.memory,
            iterations: backup.argon2Params.iterations,
            parallelism: backup.argon2Params.parallelism,
            hashLength: ARGON2_PARAMS.hashLength,
        });

        const bundleBytes = await aesGcmDecrypt(encryptionKey, encryptedBundle, nonce);

        if (serverId != null) {
            cacheBackupKey(serverId, encryptionKey, salt);
        }

        const parsed = JSON.parse(new TextDecoder().decode(bundleBytes)) as AnyBackupBundle;

        // Auto-migrate v3 → v4
        if (parsed.version === 3) {
            return migrateV3ToV4(parsed as MlsKeyBackupBundleV3);
        }

        return parsed as MlsKeyBackupBundle;
    } catch {
        return null;
    }
}

export async function encryptKeyBackupWithCachedKey(
    bundle: MlsKeyBackupBundle,
    serverId: number,
): Promise<EncryptedKeyBackup | null> {
    const cached = getCachedBackupKey(serverId);
    if (!cached) return null;

    const bundleBytes = new TextEncoder().encode(JSON.stringify(bundle));
    const { ciphertext, nonce } = await aesGcmEncrypt(cached.key, bundleBytes);

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

export function verifyBackupIntegrity(bundle: MlsKeyBackupBundle): boolean {
    if (!bundle.mls?.identityBytes || !bundle.mls?.providerBytes) return false;
    if (bundle.version !== 4) return false;
    return true;
}
