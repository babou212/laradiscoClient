import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useUsersStore } from './users';
import { getCategories } from '@/api/categories';
import { getChannel, markChannelRead as apiMarkChannelRead } from '@/api/channels';
import { getMessages } from '@/api/messages';
import { normalizeMessages } from '@/api/normalizers';
import { readPageMeta } from '@/api/pagination';
import type { ChannelAttributes } from '@/api/types';
import { getEcho } from '@/lib/echo';
import type { Category, Channel, ChannelPermissions, MessageData } from '@/types/chat';

export const useChatStore = defineStore('chat', () => {
    const currentChannel = ref<Channel | null>(null);
    const currentChannelPermissions = ref<ChannelPermissions | null>(null);
    const messages = ref<MessageData[]>([]);
    // Anchor pagination edges: ids of the oldest/newest loaded message and
    // whether more exist beyond each edge (see readPageMeta).
    const oldestId = ref<string | null>(null);
    const newestId = ref<string | null>(null);
    const hasMoreBefore = ref(false);
    const hasMoreAfter = ref(false);
    const isLoadingMessages = ref(false);
    const isLoadingMore = ref(false);
    const serverName = ref<string>('Laradisco');
    const categories = ref<Category[]>([]);

    const selectedChannelId = computed(() => currentChannel.value?.id ?? null);
    // We are viewing history (not pinned to the live tail) only when newer
    // messages exist beyond what is loaded.
    const isViewingHistory = computed(() => hasMoreAfter.value);

    function addMessage(message: MessageData): void {
        const exists = messages.value.some((m) => m.id === message.id);
        if (!exists) {
            messages.value.push(message);
            const usersStore = useUsersStore();
            usersStore.hydrateFromUsers([message.user]);
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
                    has_unread: inc.attributes.has_unread ?? false,
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

    function hydrateUsers(msgs: MessageData[]): void {
        const usersStore = useUsersStore();
        usersStore.hydrateFromUsers(msgs.map((m) => m.user));
        usersStore.hydrateFromUsers(
            msgs.filter((m) => m.thread?.last_reply?.user).map((m) => m.thread!.last_reply!.user),
        );
    }

    async function fetchMessages(channelId: string): Promise<void> {
        isLoadingMessages.value = true;
        messages.value = [];
        oldestId.value = null;
        newestId.value = null;
        hasMoreBefore.value = false;
        hasMoreAfter.value = false;
        try {
            const response = await getMessages(channelId);
            messages.value = normalizeMessages(response.data, response.included);
            const meta = readPageMeta(response.meta);
            hasMoreBefore.value = meta.hasMoreBefore;
            hasMoreAfter.value = meta.hasMoreAfter;
            oldestId.value = meta.oldestId;
            newestId.value = meta.newestId;
            hydrateUsers(messages.value);
        } catch (error) {
            console.error('Failed to fetch messages:', error);
        } finally {
            isLoadingMessages.value = false;
        }
    }

    async function loadOlderMessages(): Promise<void> {
        if (!currentChannel.value || !hasMoreBefore.value || !oldestId.value || isLoadingMore.value) return;
        isLoadingMore.value = true;
        try {
            const response = await getMessages(currentChannel.value.id, { before: oldestId.value });
            const older = normalizeMessages(response.data, response.included);
            const meta = readPageMeta(response.meta);
            if (older.length > 0) {
                messages.value = [...older, ...messages.value];
                if (meta.oldestId) oldestId.value = meta.oldestId;
            }
            hasMoreBefore.value = meta.hasMoreBefore;
            hydrateUsers(older);
        } catch (error) {
            console.error('Failed to load older messages:', error);
        } finally {
            isLoadingMore.value = false;
        }
    }

    async function loadNewerMessages(): Promise<void> {
        if (!currentChannel.value || !hasMoreAfter.value || !newestId.value || isLoadingMore.value) return;
        isLoadingMore.value = true;
        try {
            const response = await getMessages(currentChannel.value.id, { after: newestId.value });
            const newer = normalizeMessages(response.data, response.included);
            const meta = readPageMeta(response.meta);
            if (newer.length > 0) {
                messages.value = [...messages.value, ...newer];
                if (meta.newestId) newestId.value = meta.newestId;
            }
            hasMoreAfter.value = meta.hasMoreAfter;
            hydrateUsers(newer);
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
            const meta = readPageMeta(response.meta);
            hasMoreBefore.value = meta.hasMoreBefore;
            hasMoreAfter.value = meta.hasMoreAfter;
            oldestId.value = meta.oldestId;
            newestId.value = meta.newestId;
            hydrateUsers(messages.value);
        } catch (error) {
            console.error('Failed to load messages around target:', error);
        } finally {
            isLoadingMessages.value = false;
        }
    }

    function setChannelUnread(channelId: string | number, hasUnread: boolean): void {
        const id = String(channelId);
        for (const cat of categories.value) {
            const ch = cat.channels.find((c) => c.id === id);
            if (ch) {
                ch.has_unread = hasUnread;
                return;
            }
        }
    }

    async function markChannelRead(channelId: string | number): Promise<void> {
        const id = String(channelId);
        setChannelUnread(id, false);
        try {
            await apiMarkChannelRead(id);
        } catch (error) {
            console.error('Failed to mark channel as read:', error);
        }
    }

    let unreadChannelName: string | null = null;

    function connectUnread(userId: string | number): void {
        disconnectUnread();
        const echo = getEcho();
        if (!echo) return;

        const name = `user.${userId}`;
        unreadChannelName = name;

        echo.private(name).listen(
            '.ChannelActivity',
            (payload: { channel_id: number | string; message_created_at: string }) => {
                const channelId = String(payload.channel_id);
                if (currentChannel.value?.id === channelId) {
                    return;
                }
                setChannelUnread(channelId, true);
            },
        );
    }

    function disconnectUnread(): void {
        if (!unreadChannelName) return;
        const echo = getEcho();
        if (echo) {
            echo.leave(unreadChannelName);
        }
        unreadChannelName = null;
    }

    function $reset(): void {
        currentChannel.value = null;
        currentChannelPermissions.value = null;
        messages.value = [];
        oldestId.value = null;
        newestId.value = null;
        hasMoreBefore.value = false;
        hasMoreAfter.value = false;
        isLoadingMessages.value = false;
        isLoadingMore.value = false;
        serverName.value = 'Laradisco';
        categories.value = [];
    }

    return {
        currentChannel,
        currentChannelPermissions,
        messages,
        oldestId,
        newestId,
        hasMoreBefore,
        hasMoreAfter,
        isLoadingMessages,
        isLoadingMore,
        serverName,
        categories,
        selectedChannelId,
        isViewingHistory,
        addMessage,
        updateMessage,
        removeMessage,
        setChannelUnread,
        markChannelRead,
        connectUnread,
        disconnectUnread,
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
