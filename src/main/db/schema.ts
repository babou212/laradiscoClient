import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
    key: text('key').primaryKey(),
    value: text('value').notNull(),
});

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
