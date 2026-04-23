import { sql } from 'drizzle-orm';
import { blob, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const serverConnections = sqliteTable('server_connections', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    host: text('host').notNull().unique(),
    is_active: integer('is_active', { mode: 'boolean' }).notNull().default(false),
    created_at: text('created_at')
        .notNull()
        .default(sql`(datetime('now'))`),
});

export const authSessions = sqliteTable('auth_sessions', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    server_id: integer('server_id')
        .notNull()
        .unique()
        .references(() => serverConnections.id, { onDelete: 'cascade' }),
    user_id: integer('user_id').notNull(),
    user_name: text('user_name').notNull(),
    user_email: text('user_email').notNull(),
    user_avatar: text('user_avatar'),
    encrypted_token: text('encrypted_token').notNull(),
    created_at: text('created_at')
        .notNull()
        .default(sql`(datetime('now'))`),
});

export const settings = sqliteTable('settings', {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
});

export const decryptedMessages = sqliteTable(
    'decrypted_messages',
    {
        server_id: integer('server_id')
            .notNull()
            .references(() => serverConnections.id, { onDelete: 'cascade' }),
        message_id: integer('message_id').notNull(),
        plaintext: text('plaintext').notNull(),
        created_at: text('created_at')
            .notNull()
            .default(sql`(datetime('now'))`),
    },
    (t) => [primaryKey({ columns: [t.server_id, t.message_id] })],
);

export const mlsIdentity = sqliteTable(
    'mls_identity',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        server_id: integer('server_id')
            .notNull()
            .references(() => serverConnections.id, { onDelete: 'cascade' }),
        device_id: text('device_id').notNull(),
        device_name: text('device_name').notNull(),
        user_id: integer('user_id'),
        identity_bytes: blob('identity_bytes', { mode: 'buffer' }).notNull(),
        created_at: text('created_at').default(sql`(datetime('now'))`),
    },
    (t) => [uniqueIndex('mls_identity_server_id_unique').on(t.server_id)],
);

export const linkPreviews = sqliteTable('link_previews', {
    url: text('url').primaryKey(),
    status: text('status', { enum: ['ok', 'failed', 'blocked'] }).notNull(),
    metadata_json: text('metadata_json'),
    image_blob: blob('image_blob', { mode: 'buffer' }),
    image_mime: text('image_mime'),
    image_width: integer('image_width'),
    image_height: integer('image_height'),
    error: text('error'),
    fetched_at: integer('fetched_at').notNull(),
});

export const mlsProviderState = sqliteTable(
    'mls_provider_state',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        server_id: integer('server_id')
            .notNull()
            .references(() => serverConnections.id, { onDelete: 'cascade' }),
        provider_bytes: blob('provider_bytes', { mode: 'buffer' }).notNull(),
        updated_at: text('updated_at').default(sql`(datetime('now'))`),
    },
    (t) => [uniqueIndex('mls_provider_state_server_id_unique').on(t.server_id)],
);
