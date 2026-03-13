import { argon2id } from 'hash-wasm';
import { encrypt, decrypt } from './aes-gcm';
import type { KeyBackupBundle } from './types';

const ARGON2_PARAMS = {
    memory: 262144,
    iterations: 4,
    parallelism: 2,
    hashLength: 32,
};

async function deriveKeyFromPIN(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    const hash = await argon2id({
        password: pin,
        salt,
        parallelism: ARGON2_PARAMS.parallelism,
        iterations: ARGON2_PARAMS.iterations,
        memorySize: ARGON2_PARAMS.memory,
        hashLength: ARGON2_PARAMS.hashLength,
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

export async function encryptKeyBackup(bundle: KeyBackupBundle, pin: string): Promise<EncryptedKeyBackup> {
    const bundleJson = JSON.stringify(bundle);
    const bundleBytes = new TextEncoder().encode(bundleJson);

    const salt = crypto.getRandomValues(new Uint8Array(32));

    const encryptionKey = await deriveKeyFromPIN(pin, salt);

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

export async function decryptKeyBackup(backup: EncryptedKeyBackup, pin: string): Promise<KeyBackupBundle | null> {
    try {
        const salt = new Uint8Array(Buffer.from(backup.salt, 'base64'));
        const encryptedBundle = new Uint8Array(Buffer.from(backup.encryptedBundle, 'base64'));
        const nonce = new Uint8Array(Buffer.from(backup.nonce, 'base64'));

        const encryptionKey = await deriveKeyFromPIN(pin, salt);

        const bundleBytes = await decrypt(encryptionKey, encryptedBundle, nonce);

        const bundleJson = new TextDecoder().decode(bundleBytes);
        return JSON.parse(bundleJson) as KeyBackupBundle;
    } catch {
        return null;
    }
}
