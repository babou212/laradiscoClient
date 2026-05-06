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

        DROP TABLE IF EXISTS server_connections;
        DROP TABLE IF EXISTS auth_sessions;
        DROP TABLE IF EXISTS link_previews;
        DROP TABLE IF EXISTS message_search;
        DROP TABLE IF EXISTS decrypted_messages;
        DROP TABLE IF EXISTS mls_identity;
        DROP TABLE IF EXISTS mls_provider_state;
    `);
}

export function getDb(): BetterSQLite3Database<typeof schema> {
    return db;
}

export function getRawDb(): Database.Database {
    return rawDb;
}
