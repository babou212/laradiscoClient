import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDraftMessages } from './useDraftMessages';

const STORAGE_KEY = 'laradisco:message-drafts';
const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

describe('useDraftMessages', () => {
    it('returns an empty draft for an unknown or undefined key', () => {
        const { getDraft } = useDraftMessages();
        expect(getDraft('channel:unused-1')).toBe('');
        expect(getDraft(undefined)).toBe('');
    });

    it('stores and retrieves a draft by key', () => {
        const { getDraft, setDraft } = useDraftMessages();
        setDraft('channel:1', 'hello world');
        expect(getDraft('channel:1')).toBe('hello world');
    });

    it('persists drafts to localStorage keyed by conversation, with a timestamp', () => {
        const { setDraft } = useDraftMessages();
        setDraft('dm:2', 'saved text');

        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
        expect(stored['dm:2'].content).toBe('saved text');
        expect(stored['dm:2'].savedAt).toBeTypeOf('number');
    });

    it('removes the entry when the draft is cleared', () => {
        const { getDraft, setDraft, clearDraft } = useDraftMessages();
        setDraft('channel:3', 'draft text');
        clearDraft('channel:3');

        expect(getDraft('channel:3')).toBe('');
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
        expect(stored).not.toHaveProperty('channel:3');
    });

    it('is a no-op when the key is undefined', () => {
        const { setDraft, clearDraft } = useDraftMessages();
        expect(() => setDraft(undefined, 'text')).not.toThrow();
        expect(() => clearDraft(undefined)).not.toThrow();
    });

    it('shares state across independent calls (module-level store)', () => {
        const first = useDraftMessages();
        const second = useDraftMessages();

        first.setDraft('channel:4', 'shared');
        expect(second.getDraft('channel:4')).toBe('shared');
    });

    describe('pruning stale drafts on load', () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        it('drops drafts older than 2 days and keeps recent ones', async () => {
            const now = Date.now();
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                    'channel:old': { content: 'stale', savedAt: now - TWO_DAYS_MS - 1000 },
                    'channel:recent': { content: 'fresh', savedAt: now - 1000 },
                }),
            );

            vi.resetModules();
            const { useDraftMessages: freshUseDraftMessages } = await import('./useDraftMessages');
            const { getDraft } = freshUseDraftMessages();

            expect(getDraft('channel:old')).toBe('');
            expect(getDraft('channel:recent')).toBe('fresh');
        });

        it('rewrites localStorage without the pruned entries', async () => {
            const now = Date.now();
            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({
                    'channel:old': { content: 'stale', savedAt: now - TWO_DAYS_MS - 1000 },
                }),
            );

            vi.resetModules();
            await import('./useDraftMessages');

            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
            expect(stored).not.toHaveProperty('channel:old');
        });
    });
});
