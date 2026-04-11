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
    const isViewingHistory = computed(() => nextCursor.value !== null);

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
            const channelIds = Array.isArray(channelRels) ? channelRels.map((r) => r.id) : [];

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

        if (currentChannel.value?.id === id) return;

        // Try to find in already-loaded categories
        for (const cat of categories.value) {
            const ch = cat.channels.find((c) => c.id === id);
            if (ch) {
                currentChannel.value = ch;
                currentChannelPermissions.value = ch.permissions ?? null;

                const fetchPerms = !ch.permissions
                    ? getChannel(id)
                          .then((r) => {
                              const perms = r.data.attributes.channelPermissions ?? null;
                              ch.permissions = perms ?? undefined;
                              currentChannelPermissions.value = perms;
                          })
                          .catch(() => {})
                    : undefined;

                await Promise.all([fetchMessages(id), fetchPerms]);
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
            avatarStore.hydrateFromUsers(
                messages.value.filter((m) => m.thread?.last_reply?.user).map((m) => m.thread!.last_reply!.user),
            );
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
            avatarStore.hydrateFromUsers(
                older.filter((m) => m.thread?.last_reply?.user).map((m) => m.thread!.last_reply!.user),
            );
        } catch (error) {
            console.error('Failed to load older messages:', error);
        } finally {
            isLoadingMore.value = false;
        }
    }

    async function loadNewerMessages(): Promise<void> {
        if (!currentChannel.value || !nextCursor.value || isLoadingMore.value) return;
        isLoadingMore.value = true;
        try {
            const response = await getMessages(currentChannel.value.id, { cursor: nextCursor.value });
            const newer = normalizeMessages(response.data, response.included);
            messages.value = [...messages.value, ...newer];
            nextCursor.value = extractCursor(response.links?.next);
            const avatarStore = useAvatarStore();
            avatarStore.hydrateFromUsers(newer.map((m) => m.user));
            avatarStore.hydrateFromUsers(
                newer.filter((m) => m.thread?.last_reply?.user).map((m) => m.thread!.last_reply!.user),
            );
        } catch (error) {
            console.error('Failed to load newer messages:', error);
        } finally {
            isLoadingMore.value = false;
        }
    }

    async function loadMessagesAround(messageId: string): Promise<void> {
        if (!currentChannel.value) return;
        isLoadingMessages.value = true;
        try {
            const response = await getMessages(currentChannel.value.id, { around: messageId });
            messages.value = normalizeMessages(response.data, response.included);
            prevCursor.value = extractCursor(response.links?.prev);
            nextCursor.value = extractCursor(response.links?.next);
            const avatarStore = useAvatarStore();
            avatarStore.hydrateFromUsers(messages.value.map((m) => m.user));
            avatarStore.hydrateFromUsers(
                messages.value.filter((m) => m.thread?.last_reply?.user).map((m) => m.thread!.last_reply!.user),
            );
        } catch (error) {
            console.error('Failed to load messages around target:', error);
        } finally {
            isLoadingMessages.value = false;
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
        isViewingHistory,
        addMessage,
        updateMessage,
        removeMessage,
        fetchCategories,
        selectChannel,
        fetchMessages,
        loadOlderMessages,
        loadNewerMessages,
        loadMessagesAround,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useChatStore, import.meta.hot));
}
