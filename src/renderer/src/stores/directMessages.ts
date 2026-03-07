import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import api from '@/lib/api';
import type { MessageData, MessagesResponse } from '@/types/chat';

export interface DmGroup {
    id: number;
    name: string;
    other_user: {
        id: number;
        username: string;
        avatar_path: string | null;
    } | null;
    last_message: {
        content: string;
        created_at: string;
        user_id: number;
    } | null;
    last_message_at: string | null;
}

export interface CurrentDmGroup {
    id: number;
    name: string;
    other_user?: {
        id: number;
        username: string;
        avatar_path: string | null;
    };
}

export const useDirectMessagesStore = defineStore('directMessages', () => {
    const dmGroups = ref<DmGroup[]>([]);
    const currentDmGroup = ref<CurrentDmGroup | null>(null);
    const messages = ref<MessageData[]>([]);
    const nextCursor = ref<string | null>(null);
    const prevCursor = ref<string | null>(null);
    const isLoadingGroups = ref(false);
    const isLoadingMessages = ref(false);
    const isLoadingMore = ref(false);

    const selectedDmGroupId = computed(() => currentDmGroup.value?.id ?? null);

    /**
     * Fetch the list of DM groups for the sidebar.
     */
    async function fetchDmGroups(): Promise<void> {
        isLoadingGroups.value = true;
        try {
            const response = await api.get('/direct-messages');
            dmGroups.value = response.data ?? [];
        } catch (error) {
            console.error('Failed to fetch DM groups:', error);
        } finally {
            isLoadingGroups.value = false;
        }
    }

    /**
     * Select a DM group and fetch its messages.
     */
    async function selectDmGroup(groupId: number): Promise<void> {
        isLoadingMessages.value = true;
        try {
            const response = await api.get(`/direct-messages/${groupId}`);
            currentDmGroup.value = response.data.dm_group ?? null;

            if (response.data.messages) {
                messages.value = response.data.messages ?? [];
                nextCursor.value = response.data.pagination?.next_cursor ?? null;
                prevCursor.value = response.data.pagination?.prev_cursor ?? null;
            }
        } catch (error) {
            console.error('Failed to fetch DM group:', error);
        } finally {
            isLoadingMessages.value = false;
        }
    }

    /**
     * Load older messages (pagination).
     */
    async function loadOlderMessages(): Promise<void> {
        if (!prevCursor.value || !currentDmGroup.value || isLoadingMore.value) return;

        isLoadingMore.value = true;
        try {
            const response = await api.get(`/direct-messages/${currentDmGroup.value.id}`, {
                params: { cursor: prevCursor.value },
            });

            if (response.data.messages) {
                messages.value = [...(response.data.messages ?? []), ...messages.value];
                prevCursor.value = response.data.pagination?.prev_cursor ?? null;
            }
        } catch (error) {
            console.error('Failed to load older messages:', error);
        } finally {
            isLoadingMore.value = false;
        }
    }

    /**
     * Start or get an existing DM with a user.
     * Returns the DM group ID.
     */
    async function startOrGetDm(userId: number): Promise<number | null> {
        try {
            const response = await api.post('/direct-messages', { user_id: userId });
            const groupId = response.data.dm_group_id;

            // Refresh the groups list so the new DM appears in sidebar
            await fetchDmGroups();

            return groupId;
        } catch (error) {
            console.error('Failed to start DM:', error);
            return null;
        }
    }

    /**
     * Add a message to the list (from Echo event or optimistic insert).
     */
    function addMessage(message: MessageData): void {
        const exists = messages.value.some((m) => m.id === message.id);
        if (!exists) {
            messages.value.push(message);
        }

        // Update the sidebar's last message for this group
        const group = dmGroups.value.find((g) => g.id === currentDmGroup.value?.id);
        if (group) {
            group.last_message = {
                content: message.content,
                created_at: message.created_at,
                user_id: message.user.id,
            };
            group.last_message_at = message.created_at;
        }
    }

    /**
     * Update a message in the list.
     */
    function updateMessage(
        messageOrId: MessageData | number,
        partial?: Partial<MessageData>,
    ): void {
        if (typeof messageOrId === 'number') {
            const idx = messages.value.findIndex((m) => m.id === messageOrId);
            if (idx !== -1 && partial) {
                Object.assign(messages.value[idx], partial);
            }
        } else {
            const idx = messages.value.findIndex((m) => m.id === messageOrId.id);
            if (idx !== -1) {
                messages.value[idx].content = messageOrId.content;
                messages.value[idx].is_edited = true;
                messages.value[idx].edited_at = messageOrId.edited_at;
            }
        }
    }

    /**
     * Remove a message from the list.
     */
    function removeMessage(messageId: number): void {
        const idx = messages.value.findIndex((m) => m.id === messageId);
        if (idx !== -1) messages.value.splice(idx, 1);
    }

    /**
     * Clear current DM state (when navigating away).
     */
    function clearCurrentDm(): void {
        currentDmGroup.value = null;
        messages.value = [];
        nextCursor.value = null;
        prevCursor.value = null;
    }

    return {
        dmGroups,
        currentDmGroup,
        messages,
        nextCursor,
        prevCursor,
        isLoadingGroups,
        isLoadingMessages,
        isLoadingMore,
        selectedDmGroupId,
        fetchDmGroups,
        selectDmGroup,
        loadOlderMessages,
        startOrGetDm,
        addMessage,
        updateMessage,
        removeMessage,
        clearCurrentDm,
    };
});
