import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { safeStorage } from 'electron';
import { getDb, getRawDb, initDb } from './db';
import { authSessions, decryptedMessages, serverConnections, settings } from './db/schema';

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

export function initDatabase(): void {
    initDb();
}

export function getDatabase() {
    return getRawDb();
}

export function addServerConnection(name: string, host: string): ServerConnection {
    const db = getDb();

    db.update(serverConnections).set({ is_active: false }).run();

    db.insert(serverConnections)
        .values({ name, host, is_active: true })
        .onConflictDoUpdate({
            target: serverConnections.host,
            set: { name, is_active: true },
        })
        .run();

    return db.select().from(serverConnections).where(eq(serverConnections.host, host)).get() as ServerConnection;
}

export function getActiveServer(): ServerConnection | null {
    const db = getDb();
    return (
        (db.select().from(serverConnections).where(eq(serverConnections.is_active, true)).get() as ServerConnection) ??
        null
    );
}

export function getAllServers(): ServerConnection[] {
    const db = getDb();
    return db.select().from(serverConnections).orderBy(desc(serverConnections.created_at)).all() as ServerConnection[];
}

export function setActiveServer(id: number): void {
    const db = getDb();
    db.update(serverConnections).set({ is_active: false }).run();
    db.update(serverConnections).set({ is_active: true }).where(eq(serverConnections.id, id)).run();
}

export function removeServer(id: number): void {
    const db = getDb();
    db.delete(serverConnections).where(eq(serverConnections.id, id)).run();
}

function requireSafeStorage(): void {
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
            'OS keychain encryption is not available. LaraDisco requires a working keychain (GNOME Keyring, macOS Keychain, or Windows DPAPI) to protect sensitive data.',
        );
    }
}

function encryptString(value: string): string {
    requireSafeStorage();
    return safeStorage.encryptString(value).toString('base64');
}

function decryptString(encrypted: string): string {
    requireSafeStorage();
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
}

export function saveAuthSession(
    serverId: number,
    userId: number,
    userName: string,
    userEmail: string,
    userAvatar: string | null,
    token: string,
): void {
    const db = getDb();
    const encryptedToken = encryptString(token);
    const encryptedEmail = encryptString(userEmail);

    db.insert(authSessions)
        .values({
            server_id: serverId,
            user_id: userId,
            user_name: userName,
            user_email: encryptedEmail,
            user_avatar: userAvatar,
            encrypted_token: encryptedToken,
        })
        .onConflictDoUpdate({
            target: authSessions.server_id,
            set: {
                user_id: userId,
                user_name: userName,
                user_email: encryptedEmail,
                user_avatar: userAvatar,
                encrypted_token: encryptedToken,
                created_at: sql`datetime('now')`,
            },
        })
        .run();
}

export function getAuthSession(serverId: number): (Omit<AuthSession, 'encrypted_token'> & { token: string }) | null {
    const db = getDb();
    const session = db.select().from(authSessions).where(eq(authSessions.server_id, serverId)).get() as
        | AuthSession
        | undefined;

    if (!session) return null;

    try {
        const token = decryptString(session.encrypted_token);
        const userEmail = decryptString(session.user_email);

        return {
            id: session.id,
            server_id: session.server_id,
            user_id: session.user_id,
            user_name: session.user_name,
            user_email: userEmail,
            user_avatar: session.user_avatar,
            token,
            created_at: session.created_at,
        };
    } catch {
        db.delete(authSessions).where(eq(authSessions.server_id, serverId)).run();
        return null;
    }
}

export function removeAuthSession(serverId: number): void {
    const db = getDb();
    db.delete(authSessions).where(eq(authSessions.server_id, serverId)).run();
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

export function storeDecryptedMessage(serverId: number, messageId: number, plaintext: string): void {
    const db = getDb();
    const encrypted = encryptString(plaintext);
    db.insert(decryptedMessages)
        .values({ server_id: serverId, message_id: messageId, plaintext: encrypted })
        .onConflictDoUpdate({
            target: [decryptedMessages.server_id, decryptedMessages.message_id],
            set: { plaintext: encrypted },
        })
        .run();
}

export function storeDecryptedMessageIfAbsent(serverId: number, messageId: number, plaintext: string): void {
    const db = getDb();
    const encrypted = encryptString(plaintext);
    db.insert(decryptedMessages)
        .values({ server_id: serverId, message_id: messageId, plaintext: encrypted })
        .onConflictDoNothing()
        .run();
}

export function getDecryptedMessage(serverId: number, messageId: number): string | null {
    const db = getDb();
    const row = db
        .select({ plaintext: decryptedMessages.plaintext })
        .from(decryptedMessages)
        .where(and(eq(decryptedMessages.server_id, serverId), eq(decryptedMessages.message_id, messageId)))
        .get();
    if (!row) return null;
    return decryptString(row.plaintext);
}

export function getDecryptedMessages(serverId: number, messageIds: number[]): Map<number, string> {
    const result = new Map<number, string>();
    if (messageIds.length === 0) return result;

    const db = getDb();
    const rows = db
        .select({ message_id: decryptedMessages.message_id, plaintext: decryptedMessages.plaintext })
        .from(decryptedMessages)
        .where(and(eq(decryptedMessages.server_id, serverId), inArray(decryptedMessages.message_id, messageIds)))
        .all();

    for (const row of rows) {
        result.set(row.message_id, decryptString(row.plaintext));
    }
    return result;
}

export function deleteDecryptedMessages(serverId: number): void {
    const db = getDb();
    db.delete(decryptedMessages).where(eq(decryptedMessages.server_id, serverId)).run();
}

export interface SearchIndexParams {
    serverId: number;
    messageId: number;
    conversationType: 'channel' | 'dm';
    conversationId: number;
    userName: string;
    plaintext: string;
}

export function indexMessageForSearch(params: SearchIndexParams): void {
    const { serverId, messageId, conversationType, conversationId, userName, plaintext } = params;
    const rawDb = getRawDb();

    const effectiveUserName =
        userName ||
        (
            rawDb
                .prepare(`SELECT user_name FROM message_search WHERE server_id = ? AND message_id = ?`)
                .get(String(serverId), String(messageId)) as { user_name: string } | undefined
        )?.user_name ||
        '';

    rawDb
        .prepare(
            `DELETE FROM message_search WHERE rowid IN (SELECT rowid FROM message_search WHERE server_id = ? AND message_id = ?)`,
        )
        .run(String(serverId), String(messageId));
    rawDb
        .prepare(
            `INSERT INTO message_search (content, server_id, message_id, conversation_type, conversation_id, user_name)
         VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
            plaintext,
            String(serverId),
            String(messageId),
            conversationType,
            String(conversationId),
            effectiveUserName,
        );
}

export function removeMessageFromSearchIndex(serverId: number, messageId: number): void {
    const rawDb = getRawDb();
    rawDb
        .prepare(
            `DELETE FROM message_search WHERE rowid IN (SELECT rowid FROM message_search WHERE server_id = ? AND message_id = ?)`,
        )
        .run(String(serverId), String(messageId));
}

export interface SearchResult {
    messageId: number;
    serverId: number;
    snippet: string;
    conversationType: string;
    conversationId: number;
    userName: string;
}

export function searchMessages(
    serverId: number,
    conversationType: 'channel' | 'dm',
    conversationId: number,
    query: string,
    limit: number = 50,
    offset: number = 0,
): SearchResult[] {
    const ftsQuery = buildFtsQuery(query);
    if (!ftsQuery) return [];

    const rawDb = getRawDb();
    const rows = rawDb
        .prepare(
            `SELECT message_id, server_id, conversation_type, conversation_id, user_name,
                    snippet(message_search, 0, '', '', '…', 30) as snippet
             FROM message_search
             WHERE message_search MATCH ?
               AND server_id = ?
               AND conversation_type = ?
               AND conversation_id = ?
             ORDER BY rank
             LIMIT ? OFFSET ?`,
        )
        .all(ftsQuery, String(serverId), conversationType, String(conversationId), limit, offset) as Array<{
        message_id: string;
        server_id: string;
        conversation_type: string;
        conversation_id: string;
        user_name: string;
        snippet: string;
    }>;

    const seen = new Set<string>();
    return rows
        .filter((r) => {
            if (seen.has(r.message_id)) return false;
            seen.add(r.message_id);
            return true;
        })
        .map((r) => ({
            messageId: Number(r.message_id),
            serverId: Number(r.server_id),
            snippet: r.snippet,
            conversationType: r.conversation_type,
            conversationId: Number(r.conversation_id),
            userName: r.user_name,
        }));
}

function buildFtsQuery(raw: string): string {
    const cleaned = raw.replace(/[^\p{L}\p{N}\s*"]/gu, '').trim();
    if (!cleaned) return '';

    if (cleaned.includes('"') || cleaned.includes('*')) {
        return cleaned;
    }

    const terms = cleaned.split(/\s+/).filter((t) => t.length >= 1);
    if (terms.length === 0) return '';
    return terms.map((t) => `"${t}"*`).join(' ');
}

export function clearSearchIndex(serverId: number): void {
    const rawDb = getRawDb();
    rawDb.prepare(`DELETE FROM message_search WHERE server_id = ?`).run(String(serverId));
}
