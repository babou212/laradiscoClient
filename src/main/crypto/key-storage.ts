import { safeStorage } from 'electron';
import { getDatabase } from '../database';
import type {
    SenderKeyState,
} from './types';
import { serializeSenderKey, deserializeSenderKey } from './sender-keys';

export function initE2eeTables(): void {
    const db = getDatabase();

    db.exec(`
        CREATE TABLE IF NOT EXISTS device_identity (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id       INTEGER NOT NULL REFERENCES server_connections(id) ON DELETE CASCADE,
            device_id       TEXT NOT NULL,
            device_name     TEXT NOT NULL,
            user_id         INTEGER,
            created_at      TEXT DEFAULT (datetime('now')),
            UNIQUE(server_id)
        );

        CREATE TABLE IF NOT EXISTS e2ee_keys (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id               INTEGER NOT NULL REFERENCES server_connections(id) ON DELETE CASCADE,
            key_type                TEXT NOT NULL,
            key_id                  TEXT NOT NULL,
            encrypted_private_key   BLOB NOT NULL,
            public_key              BLOB,
            metadata                TEXT,
            created_at              TEXT DEFAULT (datetime('now')),
            UNIQUE(server_id, key_type, key_id)
        );

        CREATE TABLE IF NOT EXISTS e2ee_sender_keys (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id       INTEGER NOT NULL REFERENCES server_connections(id) ON DELETE CASCADE,
            channel_id      INTEGER NOT NULL,
            user_id         TEXT NOT NULL,
            device_id       TEXT NOT NULL,
            sender_key_data BLOB NOT NULL,
            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now')),
            UNIQUE(server_id, channel_id, user_id, device_id)
        );

    `);

    const columns = db.pragma('table_info(device_identity)') as Array<{ name: string }>;
    if (!columns.some((c) => c.name === 'user_id')) {
        db.exec('ALTER TABLE device_identity ADD COLUMN user_id INTEGER');
    }
}

function encryptForStorage(data: Uint8Array): Buffer {
    const b64 = Buffer.from(data).toString('base64');
    if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.encryptString(b64);
    }
    return Buffer.from(b64);
}

function decryptFromStorage(encrypted: Buffer): Uint8Array<ArrayBuffer> {
    let b64: string;
    if (safeStorage.isEncryptionAvailable()) {
        b64 = safeStorage.decryptString(encrypted);
    } else {
        b64 = encrypted.toString();
    }
    return new Uint8Array(Buffer.from(b64, 'base64'));
}

function encryptStringForStorage(data: string): Buffer {
    if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.encryptString(data);
    }
    return Buffer.from(data);
}

function decryptStringFromStorage(encrypted: Buffer): string {
    if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(encrypted);
    }
    return encrypted.toString();
}

export function saveDeviceIdentity(serverId: number, deviceId: string, deviceName: string, userId?: number): void {
    const db = getDatabase();
    db.prepare(
        `INSERT INTO device_identity (server_id, device_id, device_name, user_id)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(server_id) DO UPDATE SET device_id = excluded.device_id, device_name = excluded.device_name, user_id = excluded.user_id`,
    ).run(serverId, deviceId, deviceName, userId ?? null);
}

export function getDeviceIdentity(
    serverId: number,
    userId?: number,
): { deviceId: string; deviceName: string; userId: number | null } | null {
    const db = getDatabase();
    const row = db
        .prepare('SELECT device_id, device_name, user_id FROM device_identity WHERE server_id = ?')
        .get(serverId) as { device_id: string; device_name: string; user_id: number | null } | undefined;

    if (!row) return null;

    if (userId != null && row.user_id != null && row.user_id !== userId) {
        return null;
    }

    return { deviceId: row.device_id, deviceName: row.device_name, userId: row.user_id };
}

export function getOwnerUserId(serverId: number): number | null {
    const db = getDatabase();
    const row = db
        .prepare('SELECT user_id FROM device_identity WHERE server_id = ?')
        .get(serverId) as { user_id: number | null } | undefined;
    return row?.user_id ?? null;
}

export function storePrivateKey(
    serverId: number,
    keyType: string,
    keyId: string,
    privateKey: Uint8Array,
    publicKey?: Uint8Array,
    metadata?: Record<string, unknown>,
): void {
    const db = getDatabase();
    const encrypted = encryptForStorage(privateKey);

    db.prepare(
        `INSERT INTO e2ee_keys (server_id, key_type, key_id, encrypted_private_key, public_key, metadata)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(server_id, key_type, key_id) DO UPDATE SET
            encrypted_private_key = excluded.encrypted_private_key,
            public_key = excluded.public_key,
            metadata = excluded.metadata`,
    ).run(
        serverId,
        keyType,
        keyId,
        encrypted,
        publicKey ? Buffer.from(publicKey) : null,
        metadata ? JSON.stringify(metadata) : null,
    );
}

export function loadPrivateKey(
    serverId: number,
    keyType: string,
    keyId: string,
): Uint8Array<ArrayBuffer> | null {
    const db = getDatabase();
    const row = db
        .prepare(
            'SELECT encrypted_private_key FROM e2ee_keys WHERE server_id = ? AND key_type = ? AND key_id = ?',
        )
        .get(serverId, keyType, keyId) as { encrypted_private_key: Buffer } | undefined;

    if (!row) return null;
    return decryptFromStorage(row.encrypted_private_key);
}

export function loadPublicKey(
    serverId: number,
    keyType: string,
    keyId: string,
): Uint8Array<ArrayBuffer> | null {
    const db = getDatabase();
    const row = db
        .prepare(
            'SELECT public_key FROM e2ee_keys WHERE server_id = ? AND key_type = ? AND key_id = ?',
        )
        .get(serverId, keyType, keyId) as { public_key: Buffer | null } | undefined;

    if (!row?.public_key) return null;
    return new Uint8Array(row.public_key);
}

export function hasE2eeKeys(serverId: number, userId?: number): boolean {
    const db = getDatabase();
    const row = db
        .prepare(
            "SELECT COUNT(*) as count FROM e2ee_keys WHERE server_id = ? AND key_type = 'user_identity'",
        )
        .get(serverId) as { count: number };
    if (row.count === 0) return false;

    if (userId != null) {
        const identity = db
            .prepare('SELECT user_id FROM device_identity WHERE server_id = ?')
            .get(serverId) as { user_id: number | null } | undefined;
        if (identity && identity.user_id != null && identity.user_id !== userId) {
            return false;
        }
    }

    return true;
}

export function deletePrivateKey(serverId: number, keyType: string, keyId: string): void {
    const db = getDatabase();
    db.prepare(
        'DELETE FROM e2ee_keys WHERE server_id = ? AND key_type = ? AND key_id = ?',
    ).run(serverId, keyType, keyId);
}

export function wipeIfDifferentUser(serverId: number, userId: number): boolean {
    const db = getDatabase();
    const identity = db
        .prepare('SELECT user_id FROM device_identity WHERE server_id = ?')
        .get(serverId) as { user_id: number | null } | undefined;

    if (identity && identity.user_id != null && identity.user_id !== userId) {
        deleteAllE2eeKeys(serverId);
        return true;
    }
    return false;
}

export function deleteAllE2eeKeys(serverId: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM e2ee_keys WHERE server_id = ?').run(serverId);
    db.prepare('DELETE FROM e2ee_sender_keys WHERE server_id = ?').run(serverId);
    db.prepare('DELETE FROM device_identity WHERE server_id = ?').run(serverId);
}

export function loadOneTimePreKeyIds(serverId: number): number[] {
    const db = getDatabase();
    const rows = db
        .prepare(
            "SELECT key_id FROM e2ee_keys WHERE server_id = ? AND key_type = 'one_time_prekey'",
        )
        .all(serverId) as { key_id: string }[];
    return rows.map((r) => parseInt(r.key_id, 10));
}

export function loadSignedPreKeyIds(serverId: number): number[] {
    const db = getDatabase();
    const rows = db
        .prepare(
            "SELECT key_id FROM e2ee_keys WHERE server_id = ? AND key_type = 'signed_prekey'",
        )
        .all(serverId) as { key_id: string }[];
    return rows.map((r) => parseInt(r.key_id, 10));
}

export function saveSenderKey(
    serverId: number,
    channelId: number,
    userId: string,
    deviceId: string,
    state: SenderKeyState,
): void {
    const db = getDatabase();
    const serialized = serializeSenderKey(state);
    const encrypted = encryptStringForStorage(serialized);

    db.prepare(
        `INSERT INTO e2ee_sender_keys (server_id, channel_id, user_id, device_id, sender_key_data, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(server_id, channel_id, user_id, device_id) DO UPDATE SET
            sender_key_data = excluded.sender_key_data,
            updated_at = datetime('now')`,
    ).run(serverId, channelId, userId, deviceId, encrypted);
}

export function loadSenderKey(
    serverId: number,
    channelId: number,
    userId: string,
    deviceId: string,
): SenderKeyState | null {
    const db = getDatabase();
    const row = db
        .prepare(
            'SELECT sender_key_data FROM e2ee_sender_keys WHERE server_id = ? AND channel_id = ? AND user_id = ? AND device_id = ?',
        )
        .get(serverId, channelId, userId, deviceId) as { sender_key_data: Buffer } | undefined;

    if (!row) return null;
    const serialized = decryptStringFromStorage(row.sender_key_data);
    return deserializeSenderKey(serialized);
}

export function deleteSenderKeysForChannel(serverId: number, channelId: number): void {
    const db = getDatabase();
    db.prepare(
        'DELETE FROM e2ee_sender_keys WHERE server_id = ? AND channel_id = ?',
    ).run(serverId, channelId);
}
