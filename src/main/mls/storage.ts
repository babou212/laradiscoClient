import { and, eq, sql } from 'drizzle-orm';
import { safeStorage } from 'electron';
import { getDb } from '../db';
import { mlsIdentity, mlsProviderState } from '../db/schema';

function requireSafeStorage(): void {
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
            'OS keychain encryption is not available. LaraDisco requires a working keychain to protect MLS key material.',
        );
    }
}

function encryptForStorage(data: Uint8Array): Buffer {
    requireSafeStorage();
    const b64 = Buffer.from(data).toString('base64');
    return safeStorage.encryptString(b64);
}

function decryptFromStorage(encrypted: Buffer): Uint8Array {
    requireSafeStorage();
    const b64 = safeStorage.decryptString(encrypted);
    return new Uint8Array(Buffer.from(b64, 'base64'));
}

export interface StoredIdentity {
    serverId: number;
    deviceId: string;
    deviceName: string;
    userId: number | null;
    identityBytes: Uint8Array;
}

export function saveIdentity(
    serverId: number,
    deviceId: string,
    deviceName: string,
    userId: number | null,
    identityBytes: Uint8Array,
): void {
    const db = getDb();
    const encrypted = encryptForStorage(identityBytes);

    db.insert(mlsIdentity)
        .values({
            server_id: serverId,
            device_id: deviceId,
            device_name: deviceName,
            user_id: userId,
            identity_bytes: encrypted,
        })
        .onConflictDoUpdate({
            target: mlsIdentity.server_id,
            set: {
                device_id: deviceId,
                device_name: deviceName,
                user_id: userId,
                identity_bytes: encrypted,
            },
        })
        .run();
}

export function loadIdentity(serverId: number, userId?: number): StoredIdentity | null {
    const db = getDb();

    const conditions = [eq(mlsIdentity.server_id, serverId)];
    if (userId != null) {
        conditions.push(eq(mlsIdentity.user_id, userId));
    }

    const row = db
        .select()
        .from(mlsIdentity)
        .where(and(...conditions))
        .get();

    if (!row) return null;

    return {
        serverId: row.server_id,
        deviceId: row.device_id,
        deviceName: row.device_name,
        userId: row.user_id,
        identityBytes: decryptFromStorage(row.identity_bytes),
    };
}

export function hasIdentity(serverId: number, userId?: number): boolean {
    return loadIdentity(serverId, userId) !== null;
}

export function saveProviderState(serverId: number, providerBytes: Uint8Array): void {
    const db = getDb();
    const encrypted = encryptForStorage(providerBytes);

    db.insert(mlsProviderState)
        .values({
            server_id: serverId,
            provider_bytes: encrypted,
            updated_at: sql`datetime('now')`,
        })
        .onConflictDoUpdate({
            target: mlsProviderState.server_id,
            set: {
                provider_bytes: encrypted,
                updated_at: sql`datetime('now')`,
            },
        })
        .run();
}

export function loadProviderState(serverId: number): Uint8Array | null {
    const db = getDb();
    const row = db
        .select({ provider_bytes: mlsProviderState.provider_bytes })
        .from(mlsProviderState)
        .where(eq(mlsProviderState.server_id, serverId))
        .get();

    if (!row) return null;
    return decryptFromStorage(row.provider_bytes);
}

export function deleteAllMlsState(serverId: number): void {
    const db = getDb();
    db.delete(mlsIdentity).where(eq(mlsIdentity.server_id, serverId)).run();
    db.delete(mlsProviderState).where(eq(mlsProviderState.server_id, serverId)).run();
}

export function wipeIfDifferentUser(serverId: number, userId: number): boolean {
    const identity = loadIdentity(serverId);
    if (identity && identity.userId !== null && identity.userId !== userId) {
        deleteAllMlsState(serverId);
        return true;
    }
    return false;
}
