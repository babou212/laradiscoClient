import { join } from 'path';
import Database from 'better-sqlite3';
import { app, safeStorage } from 'electron';

export interface ServerConnection {
    id: number;
    name: string;
    host: string;
    is_active: boolean;
    created_at: string;
}

export interface AuthSession {
    id: number;
    server_id: number;
    user_id: number;
    user_name: string;
    user_email: string;
    user_avatar: string | null;
    encrypted_token: string;
    created_at: string;
}

let db: Database.Database;

export function initDatabase(): void {
    const dbPath = join(app.getPath('userData'), 'laradisco.db');
    db = new Database(dbPath);

    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
        CREATE TABLE IF NOT EXISTS server_connections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            host TEXT NOT NULL UNIQUE,
            is_active INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS auth_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id INTEGER NOT NULL UNIQUE,
            user_id INTEGER NOT NULL,
            user_name TEXT NOT NULL,
            user_email TEXT NOT NULL,
            user_avatar TEXT,
            encrypted_token TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (server_id) REFERENCES server_connections(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sent_messages (
            server_id INTEGER NOT NULL,
            message_id INTEGER NOT NULL,
            plaintext TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (server_id, message_id),
            FOREIGN KEY (server_id) REFERENCES server_connections(id) ON DELETE CASCADE
        );
    `);
}

export function getDatabase(): Database.Database {
    return db;
}

export function addServerConnection(name: string, host: string): ServerConnection {
    db.prepare('UPDATE server_connections SET is_active = 0').run();

    const stmt = db.prepare(
        'INSERT INTO server_connections (name, host, is_active) VALUES (?, ?, 1) ON CONFLICT(host) DO UPDATE SET name = excluded.name, is_active = 1',
    );
    stmt.run(name, host);

    return db.prepare('SELECT * FROM server_connections WHERE host = ?').get(host) as ServerConnection;
}

export function getActiveServer(): ServerConnection | null {
    return (db.prepare('SELECT * FROM server_connections WHERE is_active = 1').get() as ServerConnection) ?? null;
}

export function getAllServers(): ServerConnection[] {
    return db.prepare('SELECT * FROM server_connections ORDER BY created_at DESC').all() as ServerConnection[];
}

export function setActiveServer(id: number): void {
    db.prepare('UPDATE server_connections SET is_active = 0').run();
    db.prepare('UPDATE server_connections SET is_active = 1 WHERE id = ?').run(id);
}

export function removeServer(id: number): void {
    db.prepare('DELETE FROM sent_messages WHERE server_id = ?').run(id);
    db.prepare('DELETE FROM server_connections WHERE id = ?').run(id);
}

function requireSafeStorage(): void {
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
            'OS keychain encryption is not available. LaraDisco requires a working keychain (GNOME Keyring, macOS Keychain, or Windows DPAPI) to protect sensitive data.',
        );
    }
}

function encryptString(value: string): string {
    requireSafeStorage();
    return safeStorage.encryptString(value).toString('base64');
}

function decryptString(encrypted: string): string {
    requireSafeStorage();
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
}

export function saveAuthSession(
    serverId: number,
    userId: number,
    userName: string,
    userEmail: string,
    userAvatar: string | null,
    token: string,
): void {
    const encryptedToken = encryptString(token);
    const encryptedEmail = encryptString(userEmail);

    db.prepare(
        `INSERT INTO auth_sessions (server_id, user_id, user_name, user_email, user_avatar, encrypted_token)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(server_id) DO UPDATE SET
            user_id = excluded.user_id,
            user_name = excluded.user_name,
            user_email = excluded.user_email,
            user_avatar = excluded.user_avatar,
            encrypted_token = excluded.encrypted_token,
            created_at = datetime('now')`,
    ).run(serverId, userId, userName, encryptedEmail, userAvatar, encryptedToken);
}

export function getAuthSession(serverId: number): (Omit<AuthSession, 'encrypted_token'> & { token: string }) | null {
    const session = db.prepare('SELECT * FROM auth_sessions WHERE server_id = ?').get(serverId) as
        | AuthSession
        | undefined;

    if (!session) return null;

    const token = decryptString(session.encrypted_token);
    const userEmail = decryptString(session.user_email);

    return {
        id: session.id,
        server_id: session.server_id,
        user_id: session.user_id,
        user_name: session.user_name,
        user_email: userEmail,
        user_avatar: session.user_avatar,
        token,
        created_at: session.created_at,
    };
}

export function removeAuthSession(serverId: number): void {
    db.prepare('DELETE FROM auth_sessions WHERE server_id = ?').run(serverId);
}

export function getSetting(key: string): string | null {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
    db.prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(key, value);
}

export function storeSentMessage(serverId: number, messageId: number, plaintext: string): void {
    const encrypted = encryptString(plaintext);
    db.prepare(
        'INSERT INTO sent_messages (server_id, message_id, plaintext) VALUES (?, ?, ?) ON CONFLICT(server_id, message_id) DO UPDATE SET plaintext = excluded.plaintext',
    ).run(serverId, messageId, encrypted);
}

export function getSentMessage(serverId: number, messageId: number): string | null {
    const row = db
        .prepare('SELECT plaintext FROM sent_messages WHERE server_id = ? AND message_id = ?')
        .get(serverId, messageId) as { plaintext: string } | undefined;
    if (!row) return null;
    return decryptString(row.plaintext);
}

export function getSentMessages(serverId: number, messageIds: number[]): Map<number, string> {
    const result = new Map<number, string>();
    if (messageIds.length === 0) return result;

    const placeholders = messageIds.map(() => '?').join(',');
    const rows = db
        .prepare(
            `SELECT message_id, plaintext FROM sent_messages WHERE server_id = ? AND message_id IN (${placeholders})`,
        )
        .all(serverId, ...messageIds) as Array<{ message_id: number; plaintext: string }>;

    for (const row of rows) {
        result.set(row.message_id, decryptString(row.plaintext));
    }
    return result;
}

export function deleteSentMessages(serverId: number): void {
    db.prepare('DELETE FROM sent_messages WHERE server_id = ?').run(serverId);
}
