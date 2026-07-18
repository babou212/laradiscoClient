import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { app, safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import { getAuthSession } from '../auth-storage';
import { getSetting, setSetting } from '../database';

const DEVICE_ID_KEY = 'mls_device_id';

/**
 * The logged-in user's id, used to namespace all MLS state (keystore file,
 * device id, backup code) so multiple accounts on one install never share an
 * identity. Throws if called with no active session — every MLS operation runs
 * only after login, so a missing session is a programming error.
 */
function activeUserId(): string {
    const uid = getAuthSession()?.user_id;
    if (uid == null) throw new Error('No active auth session — cannot resolve MLS state for a user.');
    return String(uid);
}

interface PersistedKeystore {
    provider: string; // base64 Provider.to_bytes()
    identity: string; // base64 Identity.to_bytes() (this device's MLS identity)
    userIdentityPriv?: string; // base64 PKCS8 of the user-level Ed25519 identity key
    saved_at: string;
}

export interface LoadedKeystore {
    provider: Uint8Array;
    identity: Uint8Array;
    userIdentityPriv: string | null;
}

function keystorePath(): string {
    return join(app.getPath('userData'), `mls-${activeUserId()}.bin`);
}

function requireSafeStorage(): void {
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
            'OS keychain encryption is not available. LaraDisco requires a working keychain to protect MLS keys.',
        );
    }
}

/** Stable per-user, per-install device id, generated once and kept in the settings table. */
export function getOrCreateDeviceId(): string {
    const key = `${DEVICE_ID_KEY}_${activeUserId()}`;
    const existing = getSetting(key);
    if (existing) return existing;
    const id = randomUUID();
    setSetting(key, id);
    return id;
}

export function hasKeystore(): boolean {
    if (getAuthSession()?.user_id == null) return false;
    return existsSync(keystorePath());
}

export function saveKeystore(
    providerBlob: Uint8Array,
    identityBlob: Uint8Array,
    userIdentityPriv: string | null,
): void {
    requireSafeStorage();
    const payload: PersistedKeystore = {
        provider: Buffer.from(providerBlob).toString('base64'),
        identity: Buffer.from(identityBlob).toString('base64'),
        userIdentityPriv: userIdentityPriv ?? undefined,
        saved_at: new Date().toISOString(),
    };
    const encrypted = safeStorage.encryptString(JSON.stringify(payload));
    writeFileSync(keystorePath(), encrypted, { mode: 0o600 });
}

export function loadKeystore(): LoadedKeystore | null {
    const path = keystorePath();
    if (!existsSync(path)) return null;
    requireSafeStorage();
    try {
        const json = safeStorage.decryptString(readFileSync(path));
        const parsed = JSON.parse(json) as PersistedKeystore;
        return {
            provider: new Uint8Array(Buffer.from(parsed.provider, 'base64')),
            identity: new Uint8Array(Buffer.from(parsed.identity, 'base64')),
            userIdentityPriv: parsed.userIdentityPriv ?? null,
        };
    } catch {
        return null;
    }
}

export function removeKeystore(): void {
    const path = keystorePath();
    if (!existsSync(path)) return;
    try {
        unlinkSync(path);
    } catch {
        // already gone
    }
}

function backupCodePath(): string {
    return join(app.getPath('userData'), `mls-backup-${activeUserId()}.bin`);
}

export function saveBackupCode(code: string): void {
    requireSafeStorage();
    writeFileSync(backupCodePath(), safeStorage.encryptString(code), { mode: 0o600 });
}

export function removeBackupCode(): void {
    const path = backupCodePath();
    try {
        if (existsSync(path)) unlinkSync(path);
    } catch {
        // already gone
    }
}

export function loadBackupCode(): string | null {
    const path = backupCodePath();
    if (!existsSync(path)) return null;
    try {
        return safeStorage.decryptString(readFileSync(path));
    } catch {
        return null;
    }
}
