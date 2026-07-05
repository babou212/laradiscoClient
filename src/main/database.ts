import { and, asc, eq } from 'drizzle-orm';
import { getDb, initDb } from './db';
import { outbox, settings } from './db/schema';

export interface ActiveServer {
    id: number;
    name: string;
    host: string;
    is_active: boolean;
    created_at: string;
}

const ACTIVE_SERVER_KEY = 'active_server';

export function initDatabase(): void {
    initDb();
}

export function getSetting(key: string): string | null {
    const db = getDb();
    const row = db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).get();
    return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
    const db = getDb();
    db.insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({
            target: settings.key,
            set: { value },
        })
        .run();
}

function deleteSetting(key: string): void {
    const db = getDb();
    db.delete(settings).where(eq(settings.key, key)).run();
}

export function getActiveServer(): ActiveServer | null {
    const raw = getSetting(ACTIVE_SERVER_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as ActiveServer;
    } catch {
        deleteSetting(ACTIVE_SERVER_KEY);
        return null;
    }
}

export function saveActiveServer(name: string, host: string): ActiveServer {
    const server: ActiveServer = {
        id: 1,
        name,
        host,
        is_active: true,
        created_at: new Date().toISOString(),
    };
    setSetting(ACTIVE_SERVER_KEY, JSON.stringify(server));
    return server;
}

export function clearActiveServer(): void {
    deleteSetting(ACTIVE_SERVER_KEY);
}

export interface OutboxRow {
    client_temp_id: string;
    channel_id: string;
    is_dm: boolean;
    is_thread: boolean;
    thread_message_id: string | null;
    payload: string;
    optimistic: string;
    error: string | null;
    created_at: string;
}

function mapOutboxRow(row: typeof outbox.$inferSelect): OutboxRow {
    return {
        client_temp_id: row.clientTempId,
        channel_id: row.channelId,
        is_dm: row.isDm === 1,
        is_thread: row.isThread === 1,
        thread_message_id: row.threadMessageId,
        payload: row.payload,
        optimistic: row.optimistic,
        error: row.error,
        created_at: row.createdAt,
    };
}

// Insert or replace (retry updates the same PK) an outbound message in the durable outbox.
export function enqueueOutbox(row: OutboxRow): void {
    const db = getDb();
    const values = {
        clientTempId: row.client_temp_id,
        channelId: row.channel_id,
        isDm: row.is_dm ? 1 : 0,
        isThread: row.is_thread ? 1 : 0,
        threadMessageId: row.thread_message_id,
        payload: row.payload,
        optimistic: row.optimistic,
        error: row.error,
        createdAt: row.created_at,
    };
    db.insert(outbox)
        .values(values)
        .onConflictDoUpdate({
            target: outbox.clientTempId,
            set: {
                channelId: values.channelId,
                isDm: values.isDm,
                isThread: values.isThread,
                threadMessageId: values.threadMessageId,
                payload: values.payload,
                optimistic: values.optimistic,
                error: values.error,
                createdAt: values.createdAt,
            },
        })
        .run();
}

export function removeOutbox(clientTempId: string): void {
    const db = getDb();
    db.delete(outbox).where(eq(outbox.clientTempId, clientTempId)).run();
}

export function getOutbox(clientTempId: string): OutboxRow | null {
    const db = getDb();
    const row = db.select().from(outbox).where(eq(outbox.clientTempId, clientTempId)).get();
    return row ? mapOutboxRow(row) : null;
}

export function listOutboxForChannel(channelId: string, isDm: boolean): OutboxRow[] {
    const db = getDb();
    const rows = db
        .select()
        .from(outbox)
        .where(and(eq(outbox.channelId, channelId), eq(outbox.isDm, isDm ? 1 : 0)))
        .orderBy(asc(outbox.createdAt))
        .all();
    return rows.map(mapOutboxRow);
}

export function listAllOutbox(): OutboxRow[] {
    const db = getDb();
    return db.select().from(outbox).orderBy(asc(outbox.createdAt)).all().map(mapOutboxRow);
}
