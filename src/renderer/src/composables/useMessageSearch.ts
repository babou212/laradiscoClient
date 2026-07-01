import { ref, shallowRef } from 'vue';
import { searchChannelMessages, searchDmMessages } from '@/api/search';
import { useUsersStore } from '@/stores/users';
import type { MessageData } from '@/types/chat';

const PAGE_SIZE = 30;

function hydrateResultAuthors(messages: MessageData[]): void {
    const users = messages.map((m) => m.user).filter((u): u is NonNullable<typeof u> => !!u?.id);
    if (users.length) useUsersStore().hydrateFromUsers(users);
}

export function useMessageSearch() {
    const isSearching = shallowRef(false);
    const searchResults = ref<MessageData[]>([]);
    const searchError = shallowRef<string | null>(null);
    const hasMore = shallowRef(false);
    const currentPage = shallowRef(1);

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
            searchResults.value = response.data;
            hydrateResultAuthors(response.data);
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
            searchResults.value = [...searchResults.value, ...response.data];
            hydrateResultAuthors(response.data);
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
