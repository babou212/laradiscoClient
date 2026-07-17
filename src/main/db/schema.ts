import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
});

// ownerId = the logged-in user's id. All MLS state is namespaced per user so
// multiple accounts on one install keep separate identities, groups, and caches.
export const mlsGroups = sqliteTable(
    'mls_groups',
    {
        ownerId: text('owner_id').notNull(),
        groupId: text('group_id').notNull(),
        epoch: integer('epoch').notNull().default(0),
        lastMessageId: integer('last_message_id').notNull().default(0),
        updatedAt: text('updated_at').notNull(),
    },
    (t) => ({ pk: primaryKey({ columns: [t.ownerId, t.groupId] }) }),
);

export const decryptedMessages = sqliteTable(
    'decrypted_messages',
    {
        ownerId: text('owner_id').notNull(),
        messageId: text('message_id').notNull(),
        groupId: text('group_id').notNull(),
        content: text('content').notNull(),
        createdAt: text('created_at').notNull(),
    },
    (t) => ({ pk: primaryKey({ columns: [t.ownerId, t.messageId] }) }),
);

export const peerIdentities = sqliteTable(
    'peer_identities',
    {
        ownerId: text('owner_id').notNull(),
        userId: text('user_id').notNull(),
        identityKey: text('identity_key').notNull(),
        verified: integer('verified').notNull().default(0),
        firstSeen: text('first_seen').notNull(),
    },
    (t) => ({ pk: primaryKey({ columns: [t.ownerId, t.userId] }) }),
);

export const outbox = sqliteTable('message_outbox', {
    clientTempId: text('client_temp_id').primaryKey(),
    channelId: text('channel_id').notNull(),
    isDm: integer('is_dm').notNull().default(0),
    isThread: integer('is_thread').notNull().default(0),
    threadMessageId: text('thread_message_id'),
    payload: text('payload').notNull(),
    optimistic: text('optimistic').notNull(),
    error: text('error'),
    createdAt: text('created_at').notNull(),
});
