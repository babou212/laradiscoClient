import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export interface EncryptedFile {
    encrypted: Buffer;
    key: string; // base64
    iv: string; // base64
}

export function encryptFile(data: Buffer): EncryptedFile {
    const key = randomBytes(KEY_LENGTH);
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);

    return {
        encrypted,
        key: key.toString('base64'),
        iv: iv.toString('base64'),
    };
}

export function decryptFile(encrypted: Buffer, key: string, iv: string): Buffer {
    const keyBuffer = Buffer.from(key, 'base64');
    const ivBuffer = Buffer.from(iv, 'base64');

    const authTag = encrypted.subarray(encrypted.length - AUTH_TAG_LENGTH);
    const ciphertext = encrypted.subarray(0, encrypted.length - AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, keyBuffer, ivBuffer, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
