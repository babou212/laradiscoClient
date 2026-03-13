import { app, safeStorage } from 'electron';
import Database from 'better-sqlite3';
import { join } from 'path';

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
    db.prepare('DELETE FROM server_connections WHERE id = ?').run(id);
}

export function saveAuthSession(
    serverId: number,
    userId: number,
    userName: string,
    userEmail: string,
    userAvatar: string | null,
    token: string,
): void {
    let encryptedToken: string;
    if (safeStorage.isEncryptionAvailable()) {
        encryptedToken = safeStorage.encryptString(token).toString('base64');
    } else {
        encryptedToken = Buffer.from(token).toString('base64');
    }

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
    ).run(serverId, userId, userName, userEmail, userAvatar, encryptedToken);
}

export function getAuthSession(serverId: number): (Omit<AuthSession, 'encrypted_token'> & { token: string }) | null {
    const session = db.prepare('SELECT * FROM auth_sessions WHERE server_id = ?').get(serverId) as
        | AuthSession
        | undefined;

    if (!session) return null;

    let token: string;
    if (safeStorage.isEncryptionAvailable()) {
        token = safeStorage.decryptString(Buffer.from(session.encrypted_token, 'base64'));
    } else {
        token = Buffer.from(session.encrypted_token, 'base64').toString();
    }

    return {
        id: session.id,
        server_id: session.server_id,
        user_id: session.user_id,
        user_name: session.user_name,
        user_email: session.user_email,
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
