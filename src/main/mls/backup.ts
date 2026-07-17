import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { hashRawSync } from '@node-rs/argon2';

const ARGON2ID = 2;

export interface Argon2Params {
    memory: number; // KiB
    iterations: number;
    parallelism: number;
}

export interface EncryptedBackup {
    encrypted_bundle: string; // base64(ciphertext || 16-byte GCM tag)
    salt: string; // base64
    nonce: string; // base64
    argon2_params: Argon2Params;
}

const PARAMS: Argon2Params = { memory: 65536, iterations: 3, parallelism: 1 };
const TAG_LEN = 16;

export function generateRecoveryCode(): string {
    return randomBytes(20)
        .toString('hex')
        .toUpperCase()
        .match(/.{1,5}/g)!
        .join('-');
}

function deriveKey(recoveryCode: string, salt: Buffer, params: Argon2Params): Buffer {
    return hashRawSync(recoveryCode.replace(/-/g, ''), {
        algorithm: ARGON2ID,
        memoryCost: params.memory,
        timeCost: params.iterations,
        parallelism: params.parallelism,
        outputLen: 32,
        salt,
    });
}

export function encryptBundle(recoveryCode: string, plaintext: string): EncryptedBackup {
    const salt = randomBytes(32);
    const nonce = randomBytes(12);
    const key = deriveKey(recoveryCode, salt, PARAMS);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return {
        encrypted_bundle: Buffer.concat([ciphertext, cipher.getAuthTag()]).toString('base64'),
        salt: salt.toString('base64'),
        nonce: nonce.toString('base64'),
        argon2_params: PARAMS,
    };
}

function clampParams(p: Argon2Params): Argon2Params {
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(Number(v) || lo, lo), hi);
    return {
        memory: clamp(p.memory, 8 * 1024, 1024 * 1024), // 8 MiB .. 1 GiB
        iterations: clamp(p.iterations, 1, 20),
        parallelism: clamp(p.parallelism, 1, 8),
    };
}

export function decryptBundle(recoveryCode: string, backup: EncryptedBackup): string {
    const salt = Buffer.from(backup.salt, 'base64');
    const nonce = Buffer.from(backup.nonce, 'base64');
    const key = deriveKey(recoveryCode, salt, clampParams(backup.argon2_params));
    const blob = Buffer.from(backup.encrypted_bundle, 'base64');
    const ciphertext = blob.subarray(0, blob.length - TAG_LEN);
    const tag = blob.subarray(blob.length - TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
