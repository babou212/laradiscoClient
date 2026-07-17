import { and, asc, eq, like } from 'drizzle-orm';
import { getAuthSession } from './auth-storage';
import { getDb, initDb } from './db';
import { decryptedMessages, mlsGroups, outbox, peerIdentities, settings } from './db/schema';
import { decryptLocal, encryptLocal } from './mls/localcipher';

/**
 * The logged-in user's id, used to namespace MLS tables per user. Throws with no
 * active session — these accessors run only during authenticated MLS operations.
 */
function ownerId(): string {
    const uid = getAuthSession()?.user_id;
    if (uid == null) throw new Error('No active auth session — cannot access per-user MLS state.');
    return String(uid);
}

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

// The optimistic blob carries the message's plaintext (for redisplay after a
// failed send), so it is sealed with the local content key at rest.
function openOptimistic(stored: string): string {
    try {
        return decryptLocal(stored);
    } catch {
        return stored; // legacy plaintext row from before sealing
    }
}

function mapOutboxRow(row: typeof outbox.$inferSelect): OutboxRow {
    return {
        client_temp_id: row.clientTempId,
        channel_id: row.channelId,
        is_dm: row.isDm === 1,
        is_thread: row.isThread === 1,
        thread_message_id: row.threadMessageId,
        payload: row.payload,
        optimistic: openOptimistic(row.optimistic),
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
        optimistic: encryptLocal(row.optimistic),
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

export interface MlsGroupRow {
    group_id: string;
    epoch: number;
    last_message_id: number;
    updated_at: string;
}

export function getMlsGroup(groupId: string): MlsGroupRow | null {
    const db = getDb();
    const row = db
        .select()
        .from(mlsGroups)
        .where(and(eq(mlsGroups.ownerId, ownerId()), eq(mlsGroups.groupId, groupId)))
        .get();
    return row
        ? {
              group_id: row.groupId,
              epoch: row.epoch,
              last_message_id: row.lastMessageId,
              updated_at: row.updatedAt,
          }
        : null;
}

export function upsertMlsGroup(groupId: string, epoch: number, lastMessageId: number): void {
    const db = getDb();
    const values = {
        ownerId: ownerId(),
        groupId,
        epoch,
        lastMessageId,
        updatedAt: new Date().toISOString(),
    };
    db.insert(mlsGroups)
        .values(values)
        .onConflictDoUpdate({
            target: [mlsGroups.ownerId, mlsGroups.groupId],
            set: { epoch: values.epoch, lastMessageId: values.lastMessageId, updatedAt: values.updatedAt },
        })
        .run();
}

export function hasMlsGroup(groupId: string): boolean {
    return getMlsGroup(groupId) !== null;
}

export function listMlsGroups(): MlsGroupRow[] {
    const db = getDb();
    return db
        .select()
        .from(mlsGroups)
        .where(eq(mlsGroups.ownerId, ownerId()))
        .all()
        .map((r) => ({
            group_id: r.groupId,
            epoch: r.epoch,
            last_message_id: r.lastMessageId,
            updated_at: r.updatedAt,
        }));
}

export interface PeerIdentityRow {
    user_id: string;
    identity_key: string;
    verified: boolean;
}

export function getPeerIdentity(userId: string): PeerIdentityRow | null {
    const db = getDb();
    const row = db
        .select()
        .from(peerIdentities)
        .where(and(eq(peerIdentities.ownerId, ownerId()), eq(peerIdentities.userId, userId)))
        .get();
    return row ? { user_id: row.userId, identity_key: row.identityKey, verified: row.verified === 1 } : null;
}

/**
 * Trust-on-first-use pin. Returns 'new' the first time we see a peer's identity
 * key, 'unchanged' if it matches the pin, or 'changed' if it differs (which
 * resets the verified flag and should be surfaced to the user).
 */
export function pinPeerIdentity(userId: string, identityKey: string): 'new' | 'unchanged' | 'changed' {
    const db = getDb();
    const existing = getPeerIdentity(userId);
    if (!existing) {
        db.insert(peerIdentities)
            .values({ ownerId: ownerId(), userId, identityKey, verified: 0, firstSeen: new Date().toISOString() })
            .run();
        return 'new';
    }
    if (existing.identity_key === identityKey) return 'unchanged';

    db.update(peerIdentities)
        .set({ identityKey, verified: 0, firstSeen: new Date().toISOString() })
        .where(and(eq(peerIdentities.ownerId, ownerId()), eq(peerIdentities.userId, userId)))
        .run();
    return 'changed';
}

export function setPeerVerified(userId: string, verified: boolean): void {
    const db = getDb();
    db.update(peerIdentities)
        .set({ verified: verified ? 1 : 0 })
        .where(and(eq(peerIdentities.ownerId, ownerId()), eq(peerIdentities.userId, userId)))
        .run();
}

// decrypted_messages.content is stored AES-GCM-encrypted at rest (localcipher).
export function getDecryptedMessage(messageId: string): string | null {
    const db = getDb();
    const row = db
        .select({ content: decryptedMessages.content })
        .from(decryptedMessages)
        .where(and(eq(decryptedMessages.ownerId, ownerId()), eq(decryptedMessages.messageId, messageId)))
        .get();
    return row ? decryptLocal(row.content) : null;
}

export function putDecryptedMessage(messageId: string, groupId: string, content: string): void {
    const db = getDb();
    const sealed = encryptLocal(content);
    db.insert(decryptedMessages)
        .values({ ownerId: ownerId(), messageId, groupId, content: sealed, createdAt: new Date().toISOString() })
        .onConflictDoUpdate({ target: [decryptedMessages.ownerId, decryptedMessages.messageId], set: { content: sealed } })
        .run();
}

export function listDecryptedMessages(): Array<{ message_id: string; group_id: string; content: string; created_at: string }> {
    const db = getDb();
    return db
        .select()
        .from(decryptedMessages)
        .where(eq(decryptedMessages.ownerId, ownerId()))
        .all()
        .map((r) => ({ message_id: r.messageId, group_id: r.groupId, content: decryptLocal(r.content), created_at: r.createdAt }));
}

/**
 * Logout wipe: drop the active user's MLS rows (decrypted history, group
 * metadata, per-user settings) and all pending outbox rows. Peer identity pins
 * are kept — they are public keys and preserve TOFU across re-links.
 */
export function clearMlsLocalData(): void {
    const uid = ownerId();
    const db = getDb();
    db.delete(decryptedMessages).where(eq(decryptedMessages.ownerId, uid)).run();
    db.delete(mlsGroups).where(eq(mlsGroups.ownerId, uid)).run();
    db.delete(outbox).run();
    db.delete(settings).where(like(settings.key, `%::u${uid}`)).run();
    db.delete(settings).where(eq(settings.key, `mls_device_id_${uid}`)).run();
}
