import { eq } from 'drizzle-orm';
import { getDb, initDb } from './db';
import { settings } from './db/schema';

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
