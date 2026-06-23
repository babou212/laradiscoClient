import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMessageSearch } from './useMessageSearch';

const searchChannelMessages = vi.fn();
const searchDmMessages = vi.fn();
vi.mock('@/api/search', () => ({
    searchChannelMessages: (...a: unknown[]) => searchChannelMessages(...a),
    searchDmMessages: (...a: unknown[]) => searchDmMessages(...a),
}));

function result(id: number, content: string) {
    return { id, content, user: { username: 'alice' } };
}

beforeEach(() => {
    searchChannelMessages.mockReset();
    searchDmMessages.mockReset();
});

describe('searchInConversation', () => {
    it('maps results and sets hasMore from pagination meta', async () => {
        searchChannelMessages.mockResolvedValue({
            data: [result(1, 'hello world'), result(2, 'another')],
            meta: { current_page: 1, last_page: 3 },
        });
        const s = useMessageSearch();
        await s.searchInConversation('channel', 10, 'hello');

        expect(s.searchResults.value).toHaveLength(2);
        expect(s.searchResults.value[0]).toMatchObject({ messageId: 1, userName: 'alice' });
        expect(s.hasMore.value).toBe(true);
        expect(s.isSearching.value).toBe(false);
    });

    it('produces a truncated snippet for long content', async () => {
        const long = 'x'.repeat(50) + ' needle ' + 'y'.repeat(200);
        searchDmMessages.mockResolvedValue({ data: [result(1, long)], meta: { current_page: 1, last_page: 1 } });
        const s = useMessageSearch();
        await s.searchInConversation('dm', 5, 'needle');
        expect(s.searchResults.value[0].snippet.length).toBeLessThan(long.length);
        expect(s.searchResults.value[0].snippet).toContain('…');
    });

    it('records an error and clears results on failure', async () => {
        searchChannelMessages.mockRejectedValue(new Error('boom'));
        const s = useMessageSearch();
        await s.searchInConversation('channel', 1, 'q');
        expect(s.searchError.value).toBe('Search failed');
        expect(s.searchResults.value).toEqual([]);
        expect(s.hasMore.value).toBe(false);
    });
});

describe('loadMoreResults', () => {
    it('appends the next page and advances pagination', async () => {
        searchChannelMessages
            .mockResolvedValueOnce({ data: [result(1, 'a')], meta: { current_page: 1, last_page: 2 } })
            .mockResolvedValueOnce({ data: [result(2, 'b')], meta: { current_page: 2, last_page: 2 } });
        const s = useMessageSearch();
        await s.searchInConversation('channel', 1, 'q');
        await s.loadMoreResults('channel', 1, 'q');

        expect(s.searchResults.value.map((r) => r.messageId)).toEqual([1, 2]);
        expect(s.hasMore.value).toBe(false);
    });

    it('does nothing when there is no more to load', async () => {
        const s = useMessageSearch();
        await s.loadMoreResults('channel', 1, 'q'); // hasMore is false initially
        expect(searchChannelMessages).not.toHaveBeenCalled();
    });
});
