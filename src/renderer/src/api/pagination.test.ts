import { describe, expect, it } from 'vitest';
import { readPageMeta } from './pagination';

describe('readPageMeta', () => {
    it('reads all fields from a populated meta object', () => {
        expect(readPageMeta({ has_more_before: true, has_more_after: true, oldest_id: 10, newest_id: 20 })).toEqual({
            hasMoreBefore: true,
            hasMoreAfter: true,
            oldestId: '10',
            newestId: '20',
        });
    });

    it('defaults to false/null for an empty or undefined meta', () => {
        expect(readPageMeta(undefined)).toEqual({
            hasMoreBefore: false,
            hasMoreAfter: false,
            oldestId: null,
            newestId: null,
        });
        expect(readPageMeta({})).toEqual({
            hasMoreBefore: false,
            hasMoreAfter: false,
            oldestId: null,
            newestId: null,
        });
    });

    it('coerces numeric ids to strings and treats null ids as null', () => {
        const m = readPageMeta({ oldest_id: 0, newest_id: null });
        expect(m.oldestId).toBe('0');
        expect(m.newestId).toBeNull();
    });

    it('only treats strictly-true flags as true', () => {
        const m = readPageMeta({ has_more_before: 'yes', has_more_after: 1 });
        expect(m.hasMoreBefore).toBe(false);
        expect(m.hasMoreAfter).toBe(false);
    });
});
