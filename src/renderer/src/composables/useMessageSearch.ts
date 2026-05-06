import { ref, shallowRef } from 'vue';
import { searchChannelMessages, searchDmMessages, type MessageSearchResult } from '@/api/search';

export interface SearchResult {
    messageId: number;
    snippet: string;
    userName: string;
    raw: MessageSearchResult;
}

const PAGE_SIZE = 30;

function snippetFrom(content: string, query: string): string {
    const trimmed = content.trim();
    if (trimmed.length <= 160) return trimmed;
    const lower = trimmed.toLowerCase();
    const idx = lower.indexOf(query.toLowerCase().split(/\s+/)[0] ?? '');
    if (idx <= 60) return trimmed.slice(0, 160) + '…';
    const start = Math.max(0, idx - 60);
    const end = Math.min(trimmed.length, idx + 100);
    return (start > 0 ? '…' : '') + trimmed.slice(start, end) + (end < trimmed.length ? '…' : '');
}

export function useMessageSearch() {
    const isSearching = shallowRef(false);
    const searchResults = ref<SearchResult[]>([]);
    const searchError = shallowRef<string | null>(null);
    const hasMore = shallowRef(false);
    const currentPage = shallowRef(1);

    function mapResults(items: MessageSearchResult[], query: string): SearchResult[] {
        return items.map((m) => ({
            messageId: Number(m.id),
            snippet: snippetFrom(m.content, query),
            userName: m.user.username,
            raw: m,
        }));
    }

    async function searchInConversation(
        conversationType: 'channel' | 'dm',
        conversationId: number,
        query: string,
    ): Promise<void> {
        isSearching.value = true;
        searchError.value = null;
        currentPage.value = 1;

        try {
            const response =
                conversationType === 'channel'
                    ? await searchChannelMessages(conversationId, query, 1, PAGE_SIZE)
                    : await searchDmMessages(conversationId, query, 1, PAGE_SIZE);
            searchResults.value = mapResults(response.data, query);
            hasMore.value = response.meta.current_page < response.meta.last_page;
        } catch (err) {
            console.error('Search failed:', err);
            searchError.value = 'Search failed';
            searchResults.value = [];
            hasMore.value = false;
        } finally {
            isSearching.value = false;
        }
    }

    async function loadMoreResults(
        conversationType: 'channel' | 'dm',
        conversationId: number,
        query: string,
    ): Promise<void> {
        if (isSearching.value || !hasMore.value) return;
        isSearching.value = true;

        try {
            const nextPage = currentPage.value + 1;
            const response =
                conversationType === 'channel'
                    ? await searchChannelMessages(conversationId, query, nextPage, PAGE_SIZE)
                    : await searchDmMessages(conversationId, query, nextPage, PAGE_SIZE);
            searchResults.value = [...searchResults.value, ...mapResults(response.data, query)];
            currentPage.value = nextPage;
            hasMore.value = response.meta.current_page < response.meta.last_page;
        } catch (err) {
            console.error('Load more failed:', err);
        } finally {
            isSearching.value = false;
        }
    }

    function clearSearch(): void {
        searchResults.value = [];
        searchError.value = null;
        hasMore.value = false;
        currentPage.value = 1;
    }

    return {
        isSearching,
        searchResults,
        searchError,
        hasMore,
        searchInConversation,
        loadMoreResults,
        clearSearch,
    };
}
