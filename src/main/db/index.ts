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
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS message_outbox (
            client_temp_id TEXT PRIMARY KEY,
            channel_id TEXT NOT NULL,
            is_dm INTEGER NOT NULL DEFAULT 0,
            is_thread INTEGER NOT NULL DEFAULT 0,
            thread_message_id TEXT,
            payload TEXT NOT NULL,
            optimistic TEXT NOT NULL,
            error TEXT,
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS message_outbox_channel_idx ON message_outbox (channel_id, is_dm, created_at);
        DROP TABLE IF EXISTS server_connections;
        DROP TABLE IF EXISTS auth_sessions;
        DROP TABLE IF EXISTS link_previews;
        DROP TABLE IF EXISTS message_search;
        DROP TABLE IF EXISTS decrypted_messages;
        DROP TABLE IF EXISTS mls_identity;
        DROP TABLE IF EXISTS mls_provider_state;
        DROP TABLE IF EXISTS outbox;
        DROP TABLE IF EXISTS outbound_queue;
        DROP TABLE IF EXISTS cached_messages;
        DROP TABLE IF EXISTS messages;
        DROP TABLE IF EXISTS dm_messages;
        DROP TABLE IF EXISTS channel_permissions;
        DROP TABLE IF EXISTS channel_read_state;
        DROP TABLE IF EXISTS channels;
        DROP TABLE IF EXISTS categories;
        DROP TABLE IF EXISTS dm_groups;
        DROP TABLE IF EXISTS users;
        DROP TABLE IF EXISTS sync_state;
        DROP TABLE IF EXISTS __drizzle_migrations;
    `);
}

export function getDb(): BetterSQLite3Database<typeof schema> {
    return db;
}

export function getRawDb(): Database.Database {
    return rawDb;
}
