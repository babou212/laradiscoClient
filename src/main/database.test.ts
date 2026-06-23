import { beforeEach, describe, expect, it, vi } from 'vitest';

// better-sqlite3 is built for Electron's ABI and won't load under plain-Node
// Vitest, so back the drizzle layer with an in-memory Map. `eq(col, val)` is
// overridden to surface the lookup key the fake query chain needs.
const store = new Map<string, string>();

vi.mock('drizzle-orm', async (orig) => {
    const actual = (await orig()) as Record<string, unknown>;
    return { ...actual, eq: (_col: unknown, val: string) => ({ __eqVal: val }) };
});

const fakeDb = {
    select: () => ({
        from: () => ({
            where: (cond: { __eqVal: string }) => ({
                get: () => {
                    const v = store.get(cond.__eqVal);
                    return v === undefined ? undefined : { value: v };
                },
            }),
        }),
    }),
    insert: () => ({
        values: (row: { key: string; value: string }) => ({
            onConflictDoUpdate: () => ({
                run: () => store.set(row.key, row.value),
            }),
        }),
    }),
    delete: () => ({
        where: (cond: { __eqVal: string }) => ({
            run: () => store.delete(cond.__eqVal),
        }),
    }),
};

vi.mock('./db', () => ({ initDb: vi.fn(), getDb: () => fakeDb, getRawDb: vi.fn() }));

import { clearActiveServer, getActiveServer, getSetting, saveActiveServer, setSetting } from './database';

beforeEach(() => store.clear());

describe('settings get/set', () => {
    it('round-trips a value', () => {
        setSetting('theme', 'dark');
        expect(getSetting('theme')).toBe('dark');
    });

    it('returns null for a missing key', () => {
        expect(getSetting('nope')).toBeNull();
    });

    it('overwrites an existing key (upsert)', () => {
        setSetting('k', 'a');
        setSetting('k', 'b');
        expect(getSetting('k')).toBe('b');
    });
});

describe('active server', () => {
    it('saves and reads back the active server', () => {
        const saved = saveActiveServer('My Server', 'example.com');
        expect(saved).toMatchObject({ id: 1, name: 'My Server', host: 'example.com', is_active: true });
        const read = getActiveServer();
        expect(read).toMatchObject({ name: 'My Server', host: 'example.com' });
    });

    it('returns null when no active server is stored', () => {
        expect(getActiveServer()).toBeNull();
    });

    it('self-heals corrupt JSON by clearing it and returning null', () => {
        setSetting('active_server', '{ not valid json');
        expect(getActiveServer()).toBeNull();
        // The corrupt entry should have been deleted.
        expect(getSetting('active_server')).toBeNull();
    });

    it('clearActiveServer removes the stored server', () => {
        saveActiveServer('S', 'h');
        clearActiveServer();
        expect(getActiveServer()).toBeNull();
    });
});
