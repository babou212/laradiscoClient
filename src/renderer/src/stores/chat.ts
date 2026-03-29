import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useAvatarStore } from './avatar';
import api from '@/lib/api';
import type { Category, Channel, ChannelPermissions, MessageData, MessagesResponse } from '@/types/chat';

export const useChatStore = defineStore('chat', () => {
    const categories = ref<Category[]>([]);
    const currentChannel = ref<Channel | null>(null);
    const currentChannelPermissions = ref<ChannelPermissions | null>(null);
    const messages = ref<MessageData[]>([]);
    const nextCursor = ref<string | null>(null);
    const prevCursor = ref<string | null>(null);
    const isLoadingChannels = ref(false);
    const isLoadingMessages = ref(false);
    const isLoadingMore = ref(false);
    const pinnedMessages = ref<MessageData[]>([]);
    const isLoadingPinned = ref(false);
    const serverName = ref<string>('Laradisco');

    const selectedChannelId = computed(() => currentChannel.value?.id ?? null);

    async function fetchCategories(): Promise<void> {
        isLoadingChannels.value = true;
        try {
            const response = await api.get('/categories');
            categories.value = response.data ?? [];
        } catch (error) {
            console.error('Failed to fetch categories:', error);
        } finally {
            isLoadingChannels.value = false;
        }
    }

    async function fetchChannel(channelId: number): Promise<void> {
        try {
            const response = await api.get(`/channels/${channelId}`);
            if (response.data) {
                currentChannel.value = response.data;
                currentChannelPermissions.value = response.data.permissions ?? null;
            }
        } catch (error) {
            console.error('Failed to fetch channel:', error);
        }
    }

    async function fetchMessages(channelId: number, cursor?: string): Promise<MessagesResponse | null> {
        try {
            const params: Record<string, string> = {};
            if (cursor) params.cursor = cursor;

            const response = await api.get(`/channels/${channelId}/messages`, { params });
            return response.data as MessagesResponse;
        } catch (error) {
            console.error('Failed to fetch messages:', error);
            return null;
        }
    }

    async function selectChannel(channelId: number): Promise<void> {
        isLoadingMessages.value = true;
        try {
            const [, msgData] = await Promise.all([fetchChannel(channelId), fetchMessages(channelId)]);

            if (msgData) {
                messages.value = msgData.data ?? [];
                nextCursor.value = msgData.next_cursor ?? null;
                prevCursor.value = msgData.prev_cursor ?? null;

                const avatarStore = useAvatarStore();
                avatarStore.hydrateFromUsers(messages.value.map((m) => m.user));
            }
        } finally {
            isLoadingMessages.value = false;
        }
    }

    async function loadOlderMessages(): Promise<void> {
        if (!prevCursor.value || !currentChannel.value || isLoadingMore.value) return;

        isLoadingMore.value = true;
        try {
            const msgData = await fetchMessages(currentChannel.value.id, prevCursor.value);

            if (msgData) {
                messages.value = [...(msgData.data ?? []), ...messages.value];
                prevCursor.value = msgData.prev_cursor ?? null;
            }
        } finally {
            isLoadingMore.value = false;
        }
    }

    async function sendMessage(messageBytes: string, replyToId?: number): Promise<void> {
        if (!currentChannel.value) return;

        try {
            const response = await api.post(`/channels/${currentChannel.value.id}/messages`, {
                message_bytes: messageBytes,
                reply_to_id: replyToId,
            });

            if (response.data) {
                messages.value.push(response.data);
            }
        } catch (error) {
            console.error('Failed to send message:', error);
        }
    }

    async function editMessage(messageId: number, messageBytes: string): Promise<void> {
        if (!currentChannel.value) return;
        try {
            await api.put(`/channels/${currentChannel.value.id}/messages/${messageId}`, {
                message_bytes: messageBytes,
            });
            const msg = messages.value.find((m) => m.id === messageId);
            if (msg) {
                msg.is_edited = true;
                msg.edited_at = new Date().toISOString();
            }
        } catch (error) {
            console.error('Failed to edit message:', error);
        }
    }

    async function deleteMessage(messageId: number): Promise<void> {
        if (!currentChannel.value) return;
        try {
            await api.delete(`/channels/${currentChannel.value.id}/messages/${messageId}`);
            const idx = messages.value.findIndex((m) => m.id === messageId);
            if (idx !== -1) messages.value.splice(idx, 1);
        } catch (error) {
            console.error('Failed to delete message:', error);
        }
    }

    async function toggleReaction(messageId: number, emoji: string): Promise<void> {
        if (!currentChannel.value) return;
        try {
            const response = await api.post(`/channels/${currentChannel.value.id}/messages/${messageId}/reactions`, {
                emoji,
            });
            const msg = messages.value.find((m) => m.id === messageId);
            if (msg && response.data) {
                if (response.data.added) {
                    const userId = response.data.reaction?.user_id ?? 0;
                    msg.reactions.push({
                        id: response.data.reaction?.id ?? 0,
                        message_id: messageId,
                        user_id: userId,
                        emoji,
                    });
                } else {
                    const { useAuthStore } = await import('./auth');
                    const currentUserId = useAuthStore().user?.id ?? 0;
                    const idx = msg.reactions.findIndex((r) => r.user_id === currentUserId && r.emoji === emoji);
                    if (idx !== -1) msg.reactions.splice(idx, 1);
                }
            }
        } catch (error) {
            console.error('Failed to toggle reaction:', error);
        }
    }

    async function emitTyping(): Promise<void> {
        if (!currentChannel.value) return;
        try {
            await api.post(`/channels/${currentChannel.value.id}/typing`);
        } catch (error) {
            console.error(error);
        }
    }

    async function fetchPinnedMessages(channelId: number): Promise<void> {
        isLoadingPinned.value = true;
        try {
            const response = await api.get(`/channels/${channelId}/pins`);
            pinnedMessages.value = response.data ?? [];
        } catch (error) {
            console.error('Failed to fetch pinned messages:', error);
        } finally {
            isLoadingPinned.value = false;
        }
    }

    async function pinMessage(channelId: number, messageId: number): Promise<void> {
        try {
            await api.post(`/channels/${channelId}/messages/${messageId}/pin`);
            const msg = messages.value.find((m) => m.id === messageId);
            if (msg) {
                msg.is_pinned = true;
                msg.pinned_at = new Date().toISOString();
            }
        } catch (error) {
            console.error('Failed to pin message:', error);
            throw error;
        }
    }

    async function unpinMessage(channelId: number, messageId: number): Promise<void> {
        try {
            await api.delete(`/channels/${channelId}/messages/${messageId}/pin`);
            const msg = messages.value.find((m) => m.id === messageId);
            if (msg) {
                msg.is_pinned = false;
                msg.pinned_at = null;
            }
            const pinnedIdx = pinnedMessages.value.findIndex((m) => m.id === messageId);
            if (pinnedIdx !== -1) pinnedMessages.value.splice(pinnedIdx, 1);
        } catch (error) {
            console.error('Failed to unpin message:', error);
            throw error;
        }
    }

    function addMessage(message: MessageData): void {
        const exists = messages.value.some((m) => m.id === message.id);
        if (!exists) {
            messages.value.push(message);
            const avatarStore = useAvatarStore();
            avatarStore.hydrateFromUsers([message.user]);
        }
    }

    function updateMessage(messageOrId: MessageData | number, partial?: Partial<MessageData>): void {
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

    function removeMessage(messageId: number): void {
        const idx = messages.value.findIndex((m) => m.id === messageId);
        if (idx !== -1) messages.value.splice(idx, 1);
    }

    function $reset(): void {
        categories.value = [];
        currentChannel.value = null;
        currentChannelPermissions.value = null;
        messages.value = [];
        nextCursor.value = null;
        prevCursor.value = null;
        isLoadingChannels.value = false;
        isLoadingMessages.value = false;
        isLoadingMore.value = false;
        pinnedMessages.value = [];
        isLoadingPinned.value = false;
        serverName.value = 'Laradisco';
    }

    return {
        categories,
        currentChannel,
        currentChannelPermissions,
        messages,
        nextCursor,
        prevCursor,
        isLoadingChannels,
        isLoadingMessages,
        isLoadingMore,
        pinnedMessages,
        isLoadingPinned,
        serverName,
        selectedChannelId,
        fetchCategories,
        fetchChannel,
        fetchMessages,
        selectChannel,
        loadOlderMessages,
        sendMessage,
        editMessage,
        deleteMessage,
        toggleReaction,
        emitTyping,
        fetchPinnedMessages,
        pinMessage,
        unpinMessage,
        addMessage,
        updateMessage,
        removeMessage,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useChatStore, import.meta.hot));
}
