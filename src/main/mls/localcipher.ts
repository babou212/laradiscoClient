import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { app, safeStorage } from 'electron';
import { getAuthSession } from '../auth-storage';

const cachedKeys = new Map<string, Buffer>();

function activeUserId(): string {
    const uid = getAuthSession()?.user_id;
    if (uid == null) throw new Error('No active auth session — cannot access the local content key.');
    return String(uid);
}

function keyPath(uid: string): string {
    return join(app.getPath('userData'), `local-content-${uid}.key`);
}

/** Pre-namespacing installs kept one shared key file — first user to touch it inherits it. */
function legacyKeyPath(): string {
    return join(app.getPath('userData'), 'local-content.key');
}

function getKey(): Buffer {
    const uid = activeUserId();
    const cached = cachedKeys.get(uid);
    if (cached) return cached;
    const path = keyPath(uid);
    if (!existsSync(path) && existsSync(legacyKeyPath())) {
        writeFileSync(path, readFileSync(legacyKeyPath()), { mode: 0o600 });
    }
    if (existsSync(path)) {
        const key = Buffer.from(safeStorage.decryptString(readFileSync(path)), 'base64');
        cachedKeys.set(uid, key);
        return key;
    }
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('OS keychain unavailable — cannot protect local message history.');
    }
    const key = randomBytes(32);
    writeFileSync(path, safeStorage.encryptString(key.toString('base64')), { mode: 0o600 });
    cachedKeys.set(uid, key);
    return key;
}

/** Delete the active user's content key (logout wipe). Their local history becomes unreadable. */
export function removeLocalContentKey(): void {
    const uid = activeUserId();
    cachedKeys.delete(uid);

    try {
        if (existsSync(keyPath(uid))) unlinkSync(keyPath(uid));
    } catch {
        // already gone
    }
}

/** Encrypt a plaintext string → base64(nonce || ciphertext || tag). */
export function encryptLocal(plaintext: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', getKey(), nonce);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return Buffer.concat([nonce, ct, cipher.getAuthTag()]).toString('base64');
}

/** Decrypt a value produced by encryptLocal. */
export function decryptLocal(blob: string): string {
    const b = Buffer.from(blob, 'base64');
    const nonce = b.subarray(0, 12);
    const tag = b.subarray(b.length - 16);
    const ct = b.subarray(12, b.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', getKey(), nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
