import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutboxRow } from './database';

const rows = new Map<string, Record<string, unknown>>();

const SQL_TO_JS: Record<string, string> = {
    client_temp_id: 'clientTempId',
    channel_id: 'channelId',
    is_dm: 'isDm',
    created_at: 'createdAt',
};

type Cond = { type: 'eq'; col: string; val: unknown } | { type: 'and'; conds: Cond[] } | null;

vi.mock('drizzle-orm', async (orig) => {
    const actual = (await orig()) as Record<string, unknown>;
    return {
        ...actual,
        eq: (col: { name: string }, val: unknown) => ({ type: 'eq', col: col.name, val }),
        and: (...conds: Cond[]) => ({ type: 'and', conds }),
        asc: (col: { name: string }) => ({ col: col.name }),
    };
});

function matches(row: Record<string, unknown>, cond: Cond): boolean {
    if (!cond) return true;
    if (cond.type === 'and') return cond.conds.every((c) => matches(row, c));
    return row[SQL_TO_JS[cond.col]] === cond.val;
}

function query(cond: Cond, order?: { col: string }): Record<string, unknown>[] {
    const result = [...rows.values()].filter((r) => matches(r, cond));
    if (order) {
        const key = SQL_TO_JS[order.col];
        result.sort((a, b) => String(a[key]).localeCompare(String(b[key])));
    }
    return result;
}

const fakeDb = {
    select: () => ({
        from: () => ({
            where: (cond: Cond) => ({
                get: () => query(cond)[0],
                all: () => query(cond),
                orderBy: (order: { col: string }) => ({ all: () => query(cond, order) }),
            }),
            orderBy: (order: { col: string }) => ({ all: () => query(null, order) }),
        }),
    }),
    insert: () => ({
        values: (row: Record<string, unknown>) => ({
            onConflictDoUpdate: () => ({
                run: () => rows.set(row.clientTempId as string, row),
            }),
        }),
    }),
    delete: () => ({
        where: (cond: Cond) => ({
            run: () => {
                for (const [k, r] of rows) if (matches(r, cond)) rows.delete(k);
            },
        }),
    }),
};

vi.mock('./db', () => ({ initDb: vi.fn(), getDb: () => fakeDb, getRawDb: vi.fn() }));
vi.mock('./auth-storage', () => ({ getAuthSession: () => ({ user_id: 1 }) }));

import { enqueueOutbox, getOutbox, listOutboxForChannel, removeOutbox } from './database';

function makeRow(overrides: Partial<OutboxRow> = {}): OutboxRow {
    return {
        client_temp_id: 'uuid-1',
        channel_id: '10',
        is_dm: false,
        is_thread: false,
        thread_message_id: null,
        payload: '{"content":"hi"}',
        optimistic: '{"id":"uuid-1"}',
        error: null,
        created_at: '2026-07-04T00:00:00.000Z',
        ...overrides,
    };
}

beforeEach(() => rows.clear());

describe('outbox accessors', () => {
    it('enqueues and reads a row back', () => {
        enqueueOutbox(makeRow());
        expect(getOutbox('uuid-1')).toMatchObject({
            client_temp_id: 'uuid-1',
            channel_id: '10',
            is_dm: false,
            payload: '{"content":"hi"}',
        });
    });

    it('returns null for an unknown id', () => {
        expect(getOutbox('missing')).toBeNull();
    });

    it('replaces on conflicting client_temp_id (retry updates in place)', () => {
        enqueueOutbox(makeRow({ error: null }));
        enqueueOutbox(makeRow({ error: 'HTTP 500' }));
        expect(getOutbox('uuid-1')?.error).toBe('HTTP 500');
        expect(listOutboxForChannel('10', false)).toHaveLength(1);
    });

    it('removes a row', () => {
        enqueueOutbox(makeRow());
        removeOutbox('uuid-1');
        expect(getOutbox('uuid-1')).toBeNull();
    });

    it('lists only rows for the given channel + isDm, oldest first', () => {
        enqueueOutbox(makeRow({ client_temp_id: 'a', channel_id: '10', created_at: '2026-07-04T00:00:02.000Z' }));
        enqueueOutbox(makeRow({ client_temp_id: 'b', channel_id: '10', created_at: '2026-07-04T00:00:01.000Z' }));
        enqueueOutbox(makeRow({ client_temp_id: 'c', channel_id: '99' }));
        enqueueOutbox(makeRow({ client_temp_id: 'd', channel_id: '10', is_dm: true }));

        const list = listOutboxForChannel('10', false);
        expect(list.map((r) => r.client_temp_id)).toEqual(['b', 'a']);
    });
});
