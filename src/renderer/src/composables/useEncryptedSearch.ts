import { ref, type Ref } from 'vue';
import { useE2EE } from './useE2EE';
import api from '@/lib/api';
import { useServerStore } from '@/stores/server';
import type { MessageData } from '@/types/chat';

export function useEncryptedSearch() {
    const e2ee = useE2EE();

    const isSearching: Ref<boolean> = ref(false);
    const searchResults: Ref<MessageData[]> = ref([]);
    const searchError: Ref<string | null> = ref(null);
    const hasMore: Ref<boolean> = ref(false);

    function getServerId(): number {
        const serverStore = useServerStore();
        const id = serverStore.activeServer?.id;
        if (!id) throw new Error('No active server');
        return id;
    }

    async function generateTokensForMessage(
        type: 'channel' | 'dm',
        targetId: number,
        plaintext: string,
    ): Promise<string[]> {
        try {
            return await window.api.e2ee.generateSearchTokens({
                serverId: getServerId(),
                type,
                targetId,
                plaintext,
            });
        } catch {
            // SSE token generation failure should not block sending
            return [];
        }
    }

    async function searchInConversation(
        type: 'channel' | 'dm',
        targetId: number,
        query: string,
        beforeId?: number,
        limit: number = 50,
    ): Promise<void> {
        if (!query.trim()) {
            searchResults.value = [];
            searchError.value = null;
            hasMore.value = false;
            return;
        }

        isSearching.value = true;
        searchError.value = null;

        try {
            const tokens = await window.api.e2ee.generateSearchTrapdoor({
                serverId: getServerId(),
                type,
                targetId,
                query,
            });

            if (tokens.length === 0) {
                searchResults.value = [];
                hasMore.value = false;
                return;
            }

            const response = await api.post('/e2ee/search', {
                conversation_type: type,
                conversation_id: targetId,
                tokens,
                limit,
                ...(beforeId ? { before_id: beforeId } : {}),
            });

            const data = response.data as {
                message_ids: number[];
                has_more: boolean;
            };

            hasMore.value = data.has_more;

            if (data.message_ids.length === 0) {
                searchResults.value = [];
                return;
            }

            const messages = await fetchMessagesByIds(type, targetId, data.message_ids);

            const decrypted = await decryptSearchResults(type, targetId, messages);

            searchResults.value = decrypted;
        } catch (err: any) {
            searchError.value = err?.message || 'Search failed. Please try again.';
            searchResults.value = [];
        } finally {
            isSearching.value = false;
        }
    }

    async function loadMoreResults(type: 'channel' | 'dm', targetId: number, query: string): Promise<void> {
        if (!hasMore.value || searchResults.value.length === 0) return;

        const lastId = Math.min(...searchResults.value.map((m) => m.id));

        const previousResults = [...searchResults.value];

        await searchInConversation(type, targetId, query, lastId);

        searchResults.value = [...previousResults, ...searchResults.value];
    }

    async function fetchMessagesByIds(
        type: 'channel' | 'dm',
        targetId: number,
        messageIds: number[],
    ): Promise<MessageData[]> {
        const endpoint =
            type === 'dm' ? `/direct-messages/${targetId}/messages/batch` : `/channels/${targetId}/messages/batch`;

        try {
            const response = await api.post(endpoint, { message_ids: messageIds });
            const data = response.data;
            return Array.isArray(data) ? data : ((data as any)?.data ?? []);
        } catch {
            const endpoint2 = type === 'dm' ? `/direct-messages/${targetId}` : `/channels/${targetId}/messages`;

            const response = await api.get(endpoint2);
            const rawData = response.data;

            let allMessages: MessageData[];
            if (Array.isArray(rawData)) {
                allMessages = rawData;
            } else if (type === 'dm') {
                allMessages = (rawData as any)?.messages ?? [];
            } else {
                allMessages = (rawData as any)?.data ?? [];
                if (!Array.isArray(allMessages)) allMessages = [];
            }

            const idSet = new Set(messageIds);
            return allMessages.filter((m) => idSet.has(m.id));
        }
    }

    async function decryptSearchResults(
        type: 'channel' | 'dm',
        targetId: number,
        messages: MessageData[],
    ): Promise<MessageData[]> {
        const results: MessageData[] = [];

        for (const msg of messages) {
            if (msg.is_encrypted && !msg.decrypted_content) {
                try {
                    const decrypted = await e2ee.decrypt(
                        msg.content,
                        msg.user.id,
                        msg.sender_device_id ?? '',
                        type === 'channel' ? targetId : undefined,
                        type === 'dm' ? targetId : undefined,
                    );
                    results.push({
                        ...msg,
                        decrypted_content: decrypted,
                    });
                } catch {
                    results.push({
                        ...msg,
                        decrypt_error: true,
                    });
                }
            } else {
                results.push(msg);
            }
        }

        return results;
    }

    function clearSearch(): void {
        searchResults.value = [];
        searchError.value = null;
        hasMore.value = false;
        isSearching.value = false;
    }

    return {
        isSearching,
        searchResults,
        searchError,
        hasMore,
        generateTokensForMessage,
        searchInConversation,
        loadMoreResults,
        clearSearch,
    };
}
