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
        -- One-time reset: these three tables gained an owner_id column so MLS
        -- state is namespaced per user. Drop the old single-owner tables so they
        -- recreate with the new schema; they are local caches/pins that rebuild
        -- from the server and re-pin on next use.
        DROP TABLE IF EXISTS mls_groups;
        DROP TABLE IF EXISTS decrypted_messages;
        DROP TABLE IF EXISTS peer_identities;

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

        CREATE TABLE IF NOT EXISTS mls_groups (
            owner_id TEXT NOT NULL,
            group_id TEXT NOT NULL,
            epoch INTEGER NOT NULL DEFAULT 0,
            last_message_id INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (owner_id, group_id)
        );

        CREATE TABLE IF NOT EXISTS decrypted_messages (
            owner_id TEXT NOT NULL,
            message_id TEXT NOT NULL,
            group_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (owner_id, message_id)
        );

        CREATE TABLE IF NOT EXISTS peer_identities (
            owner_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            identity_key TEXT NOT NULL,
            verified INTEGER NOT NULL DEFAULT 0,
            first_seen TEXT NOT NULL,
            PRIMARY KEY (owner_id, user_id)
        );
        DROP TABLE IF EXISTS server_connections;
        DROP TABLE IF EXISTS auth_sessions;
        DROP TABLE IF EXISTS link_previews;
        DROP TABLE IF EXISTS message_search;
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
