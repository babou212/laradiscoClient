import { join } from 'path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { app } from 'electron';
import * as schema from './schema';

let db: BetterSQLite3Database<typeof schema>;
let rawDb: Database.Database;

export function initDb(): void {
    const dbPath = join(app.getPath('userData'), 'laradisco.db');
    rawDb = new Database(dbPath);

    rawDb.pragma('journal_mode = WAL');
    rawDb.pragma('foreign_keys = ON');

    db = drizzle(rawDb, { schema });

    rawDb.exec(`
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

        CREATE TABLE IF NOT EXISTS decrypted_messages (
            server_id INTEGER NOT NULL,
            message_id INTEGER NOT NULL,
            plaintext TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (server_id, message_id),
            FOREIGN KEY (server_id) REFERENCES server_connections(id) ON DELETE CASCADE
        );

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

        CREATE TABLE IF NOT EXISTS link_previews (
            url             TEXT PRIMARY KEY,
            status          TEXT NOT NULL,
            metadata_json   TEXT,
            image_blob      BLOB,
            image_mime      TEXT,
            image_width     INTEGER,
            image_height    INTEGER,
            error           TEXT,
            fetched_at      INTEGER NOT NULL
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS message_search USING fts5(
            content,
            server_id UNINDEXED,
            message_id UNINDEXED,
            conversation_type UNINDEXED,
            conversation_id UNINDEXED,
            user_name UNINDEXED,
            tokenize='unicode61 remove_diacritics 2'
        );
    `);
}

export function getDb(): BetterSQLite3Database<typeof schema> {
    return db;
}

export function getRawDb(): Database.Database {
    return rawDb;
}
