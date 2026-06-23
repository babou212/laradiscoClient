import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePresenceStore } from '@/stores/presence';
import { extractMentionMetadata } from './mentions';

// presence store pulls in users store + api/echo; stub those edges.
vi.mock('@/lib/echo', () => ({
    getEcho: () => ({ private: () => ({ listen: () => ({}) }), leave: vi.fn() }),
    getSocketId: () => undefined,
}));

beforeEach(() => {
    setActivePinia(createPinia());
    const presence = usePresenceStore();
    // allMembers is computed from the users store; seed it directly.
    vi.spyOn(presence, 'allMembers', 'get').mockReturnValue([
        { id: '1', username: 'alice', display_name: 'Alice', avatar_urls: null, custom_status: null, status: 'online' },
        { id: '2', username: 'Bob', display_name: 'Bob', avatar_urls: null, custom_status: null, status: 'online' },
    ]);
});

describe('extractMentionMetadata', () => {
    it('resolves @username to a numeric user id (case-insensitive)', () => {
        const r = extractMentionMetadata('hey @alice and @BOB');
        expect(r.userIds.sort()).toEqual([1, 2]);
    });

    it('flags @everyone and @here without treating them as users', () => {
        const r = extractMentionMetadata('@everyone @here hi');
        expect(r.mentionEveryone).toBe(true);
        expect(r.mentionHere).toBe(true);
        expect(r.userIds).toEqual([]);
    });

    it('dedupes repeated mentions of the same user', () => {
        const r = extractMentionMetadata('@alice @alice @alice');
        expect(r.userIds).toEqual([1]);
    });

    it('ignores unknown usernames', () => {
        const r = extractMentionMetadata('@nobody here');
        expect(r.userIds).toEqual([]);
    });
});
