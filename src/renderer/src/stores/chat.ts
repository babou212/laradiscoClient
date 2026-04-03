import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useAvatarStore } from './avatar';
import { getCategories } from '@/api/categories';
import { getChannel } from '@/api/channels';
import { getMessages } from '@/api/messages';
import { normalizeMessages } from '@/api/normalizers';
import type { ChannelAttributes } from '@/api/types';
import type { Category, Channel, ChannelPermissions, MessageData } from '@/types/chat';

function extractCursor(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        return new URL(url).searchParams.get('cursor');
    } catch {
        return url;
    }
}

export const useChatStore = defineStore('chat', () => {
    const currentChannel = ref<Channel | null>(null);
    const currentChannelPermissions = ref<ChannelPermissions | null>(null);
    const messages = ref<MessageData[]>([]);
    const nextCursor = ref<string | null>(null);
    const prevCursor = ref<string | null>(null);
    const isLoadingMessages = ref(false);
    const isLoadingMore = ref(false);
    const serverName = ref<string>('Laradisco');
    const categories = ref<Category[]>([]);

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

    function updateMessage(messageOrId: MessageData | string, partial?: Partial<MessageData>): void {
        if (typeof messageOrId === 'string') {
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

    function removeMessage(messageId: string): void {
        const idx = messages.value.findIndex((m) => m.id === messageId);
        if (idx !== -1) messages.value.splice(idx, 1);
    }

    async function fetchCategories(): Promise<void> {
        const response = await getCategories({ include: 'channels' });
        const included = response.included ?? [];

        categories.value = response.data.map((cat) => {
            const channelRels = cat.relationships?.channels?.data;
            const channelIds = Array.isArray(channelRels)
                ? channelRels.map((r) => r.id)
                : [];

            const channels: Channel[] = channelIds
                .map((id) => included.find((inc) => inc.type === 'channels' && inc.id === id))
                .filter((inc): inc is typeof inc & { attributes: ChannelAttributes } => inc?.type === 'channels')
                .map((inc) => ({
                    id: inc.id,
                    name: inc.attributes.name,
                    topic: inc.attributes.topic ?? null,
                    type: inc.attributes.channel_type,
                    is_private: inc.attributes.is_private,
                    permissions: inc.attributes.channelPermissions,
                }));

            return {
                id: cat.id,
                name: cat.attributes.name,
                position: cat.attributes.position,
                channels,
            };
        });
    }

    async function selectChannel(channelId: number | string): Promise<void> {
        const id = String(channelId);

        // Try to find in already-loaded categories
        for (const cat of categories.value) {
            const ch = cat.channels.find((c) => c.id === id);
            if (ch) {
                currentChannel.value = ch;
                currentChannelPermissions.value = ch.permissions ?? null;
                await fetchMessages(id);
                return;
            }
        }

        // Fallback: fetch from API
        const response = await getChannel(id);
        const attrs = response.data.attributes;
        currentChannel.value = {
            id: response.data.id,
            name: attrs.name,
            topic: attrs.topic ?? null,
            type: attrs.channel_type,
            is_private: attrs.is_private,
            permissions: attrs.channelPermissions,
        };
        currentChannelPermissions.value = attrs.channelPermissions ?? null;
        await fetchMessages(id);
    }

    async function fetchMessages(channelId: string): Promise<void> {
        isLoadingMessages.value = true;
        messages.value = [];
        nextCursor.value = null;
        prevCursor.value = null;
        try {
            const response = await getMessages(channelId);
            messages.value = normalizeMessages(response.data, response.included);
            prevCursor.value = extractCursor(response.links?.prev);
            nextCursor.value = extractCursor(response.links?.next);
            const avatarStore = useAvatarStore();
            avatarStore.hydrateFromUsers(messages.value.map((m) => m.user));
        } catch (error) {
            console.error('Failed to fetch messages:', error);
        } finally {
            isLoadingMessages.value = false;
        }
    }

    async function loadOlderMessages(): Promise<void> {
        if (!currentChannel.value || !prevCursor.value || isLoadingMore.value) return;
        isLoadingMore.value = true;
        try {
            const response = await getMessages(currentChannel.value.id, { cursor: prevCursor.value });
            const older = normalizeMessages(response.data, response.included);
            messages.value = [...older, ...messages.value];
            prevCursor.value = extractCursor(response.links?.prev);
            const avatarStore = useAvatarStore();
            avatarStore.hydrateFromUsers(older.map((m) => m.user));
        } catch (error) {
            console.error('Failed to load older messages:', error);
        } finally {
            isLoadingMore.value = false;
        }
    }

    function $reset(): void {
        currentChannel.value = null;
        currentChannelPermissions.value = null;
        messages.value = [];
        nextCursor.value = null;
        prevCursor.value = null;
        isLoadingMessages.value = false;
        isLoadingMore.value = false;
        serverName.value = 'Laradisco';
        categories.value = [];
    }

    return {
        currentChannel,
        currentChannelPermissions,
        messages,
        nextCursor,
        prevCursor,
        isLoadingMessages,
        isLoadingMore,
        serverName,
        categories,
        selectedChannelId,
        addMessage,
        updateMessage,
        removeMessage,
        fetchCategories,
        selectChannel,
        fetchMessages,
        loadOlderMessages,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useChatStore, import.meta.hot));
}
