import { safeStorage } from 'electron';
import { getDatabase } from '../database';

export function initMlsTables(): void {
    const db = getDatabase();

    db.exec(`
        CREATE TABLE IF NOT EXISTS mls_identity (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id       INTEGER NOT NULL REFERENCES server_connections(id) ON DELETE CASCADE,
            device_id       TEXT NOT NULL,
            device_name     TEXT NOT NULL,
            user_id         INTEGER,
            identity_bytes  BLOB NOT NULL,
            created_at      TEXT DEFAULT (datetime('now')),
            UNIQUE(server_id)
        );

        CREATE TABLE IF NOT EXISTS mls_provider_state (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id       INTEGER NOT NULL REFERENCES server_connections(id) ON DELETE CASCADE,
            provider_bytes  BLOB NOT NULL,
            updated_at      TEXT DEFAULT (datetime('now')),
            UNIQUE(server_id)
        );
    `);
}

function requireSafeStorage(): void {
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
            'OS keychain encryption is not available. LaraDisco requires a working keychain to protect MLS key material.',
        );
    }
}

function encryptForStorage(data: Uint8Array): Buffer {
    requireSafeStorage();
    const b64 = Buffer.from(data).toString('base64');
    return safeStorage.encryptString(b64);
}

function decryptFromStorage(encrypted: Buffer): Uint8Array {
    requireSafeStorage();
    const b64 = safeStorage.decryptString(encrypted);
    return new Uint8Array(Buffer.from(b64, 'base64'));
}

export interface StoredIdentity {
    serverId: number;
    deviceId: string;
    deviceName: string;
    userId: number | null;
    identityBytes: Uint8Array;
}

export function saveIdentity(
    serverId: number,
    deviceId: string,
    deviceName: string,
    userId: number | null,
    identityBytes: Uint8Array,
): void {
    const db = getDatabase();
    const encrypted = encryptForStorage(identityBytes);

    db.prepare(
        `INSERT INTO mls_identity (server_id, device_id, device_name, user_id, identity_bytes)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(server_id) DO UPDATE SET
            device_id = excluded.device_id,
            device_name = excluded.device_name,
            user_id = excluded.user_id,
            identity_bytes = excluded.identity_bytes`,
    ).run(serverId, deviceId, deviceName, userId, encrypted);
}

export function loadIdentity(serverId: number, userId?: number): StoredIdentity | null {
    const db = getDatabase();
    let row: Record<string, unknown> | undefined;

    if (userId != null) {
        row = db.prepare('SELECT * FROM mls_identity WHERE server_id = ? AND user_id = ?').get(serverId, userId) as
            | Record<string, unknown>
            | undefined;
    } else {
        row = db.prepare('SELECT * FROM mls_identity WHERE server_id = ?').get(serverId) as
            | Record<string, unknown>
            | undefined;
    }

    if (!row) return null;

    return {
        serverId: row.server_id as number,
        deviceId: row.device_id as string,
        deviceName: row.device_name as string,
        userId: row.user_id as number | null,
        identityBytes: decryptFromStorage(row.identity_bytes as Buffer),
    };
}

export function hasIdentity(serverId: number, userId?: number): boolean {
    return loadIdentity(serverId, userId) !== null;
}

export function saveProviderState(serverId: number, providerBytes: Uint8Array): void {
    const db = getDatabase();
    const encrypted = encryptForStorage(providerBytes);

    db.prepare(
        `INSERT INTO mls_provider_state (server_id, provider_bytes, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(server_id) DO UPDATE SET
            provider_bytes = excluded.provider_bytes,
            updated_at = datetime('now')`,
    ).run(serverId, encrypted);
}

export function loadProviderState(serverId: number): Uint8Array | null {
    const db = getDatabase();
    const row = db.prepare('SELECT provider_bytes FROM mls_provider_state WHERE server_id = ?').get(serverId) as
        | { provider_bytes: Buffer }
        | undefined;

    if (!row) return null;
    return decryptFromStorage(row.provider_bytes);
}

export function deleteAllMlsState(serverId: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM mls_identity WHERE server_id = ?').run(serverId);
    db.prepare('DELETE FROM mls_provider_state WHERE server_id = ?').run(serverId);
}

export function wipeIfDifferentUser(serverId: number, userId: number): boolean {
    const identity = loadIdentity(serverId);
    if (identity && identity.userId !== null && identity.userId !== userId) {
        deleteAllMlsState(serverId);
        return true;
    }
    return false;
}
