import { ref, type Ref } from 'vue';
import { useServerStore } from '@/stores/server';

interface LocalSearchResult {
    messageId: number;
    serverId: number;
    snippet: string;
    conversationType: string;
    conversationId: number;
    userName: string;
}

export function useEncryptedSearch() {
    const isSearching: Ref<boolean> = ref(false);
    const searchResults: Ref<LocalSearchResult[]> = ref([]);
    const searchError: Ref<string | null> = ref(null);
    const hasMore: Ref<boolean> = ref(false);
    const currentOffset: Ref<number> = ref(0);
    const pageSize = 50;

    function getServerId(): number {
        const serverStore = useServerStore();
        const id = serverStore.activeServer?.id;
        if (!id) throw new Error('No active server');
        return id;
    }

    async function searchInConversation(type: 'channel' | 'dm', targetId: number, query: string): Promise<void> {
        if (!query.trim()) {
            searchResults.value = [];
            searchError.value = null;
            hasMore.value = false;
            currentOffset.value = 0;
            return;
        }

        isSearching.value = true;
        searchError.value = null;
        currentOffset.value = 0;

        try {
            const results = await window.api.messages.searchLocal({
                serverId: getServerId(),
                conversationType: type,
                conversationId: targetId,
                query,
                limit: pageSize + 1,
                offset: 0,
            });

            hasMore.value = results.length > pageSize;
            searchResults.value = results.slice(0, pageSize);
            currentOffset.value = pageSize;
        } catch (err: any) {
            searchError.value = err?.message || 'Search failed. Please try again.';
            searchResults.value = [];
        } finally {
            isSearching.value = false;
        }
    }

    async function loadMoreResults(type: 'channel' | 'dm', targetId: number, query: string): Promise<void> {
        if (!hasMore.value) return;

        isSearching.value = true;

        try {
            const results = await window.api.messages.searchLocal({
                serverId: getServerId(),
                conversationType: type,
                conversationId: targetId,
                query,
                limit: pageSize + 1,
                offset: currentOffset.value,
            });

            hasMore.value = results.length > pageSize;
            searchResults.value = [...searchResults.value, ...results.slice(0, pageSize)];
            currentOffset.value += pageSize;
        } catch (err: any) {
            searchError.value = err?.message || 'Failed to load more results.';
        } finally {
            isSearching.value = false;
        }
    }

    function clearSearch(): void {
        searchResults.value = [];
        searchError.value = null;
        hasMore.value = false;
        isSearching.value = false;
        currentOffset.value = 0;
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
