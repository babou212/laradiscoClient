import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useAvatarStore } from './avatar';
import { useE2EE } from '@/composables/useE2EE';
import api from '@/lib/api';
import type { AvatarUrls, MessageData } from '@/types/chat';

export interface DmGroup {
    id: number;
    name: string;
    other_user: {
        id: number;
        username: string;
        avatar_urls: AvatarUrls | null;
    } | null;
    last_message: {
        id: number;
        content: string;
        created_at: string;
        user_id: number;
        sender_device_id?: string;
        decrypted_content?: string;
        decrypt_error?: boolean;
    } | null;
    last_message_at: string | null;
}

export interface CurrentDmGroup {
    id: number;
    name: string;
    other_user?: {
        id: number;
        username: string;
        avatar_urls: AvatarUrls | null;
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

    async function fetchDmGroups(): Promise<void> {
        isLoadingGroups.value = true;
        try {
            const response = await api.get('/direct-messages');
            dmGroups.value = response.data ?? [];

            const avatarStore = useAvatarStore();
            const users = dmGroups.value
                .filter((dm) => dm.other_user)
                .map((dm) => ({ id: dm.other_user!.id, avatar_urls: dm.other_user!.avatar_urls }));
            avatarStore.hydrateFromUsers(users);
        } catch (error) {
            console.error('Failed to fetch DM groups:', error);
        } finally {
            isLoadingGroups.value = false;
        }
    }

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

    async function startOrGetDm(userId: number): Promise<number | null> {
        try {
            const response = await api.post('/direct-messages', { user_id: userId });
            const groupId = response.data.dm_group_id;

            await fetchDmGroups();

            return groupId;
        } catch (error) {
            console.error('Failed to start DM:', error);
            return null;
        }
    }

    function addMessage(message: MessageData): void {
        const exists = messages.value.some((m) => m.id === message.id);
        if (!exists) {
            messages.value.push(message);
        }

        const group = dmGroups.value.find((g) => g.id === currentDmGroup.value?.id);
        if (group) {
            group.last_message = {
                id: message.id,
                content: message.content,
                created_at: message.created_at,
                user_id: message.user.id,
                sender_device_id: message.sender_device_id,
                decrypted_content: message.decrypted_content,
            };
            group.last_message_at = message.created_at;

            if (!message.decrypted_content) {
                decryptLastMessage(group).catch(() => {});
            }
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

    async function decryptLastMessage(group: DmGroup): Promise<void> {
        const lm = group.last_message;
        if (!lm || lm.decrypted_content || lm.decrypt_error) return;

        const e2ee = useE2EE();

        const temp: MessageData[] = [
            {
                id: lm.id,
                content: lm.content,
                sender_device_id: lm.sender_device_id,
            } as MessageData,
        ];
        await e2ee.lookupDecryptedCache(temp);
        if (temp[0].decrypted_content) {
            lm.decrypted_content = temp[0].decrypted_content;
            return;
        }

        const ourDeviceId = await e2ee.getDeviceId();
        if (ourDeviceId && lm.sender_device_id === ourDeviceId) {
            lm.decrypt_error = true;
            return;
        }

        try {
            const plaintext = await e2ee.decrypt(lm.content, undefined, group.id, lm.id);
            lm.decrypted_content = plaintext.text;
        } catch {
            lm.decrypt_error = true;
        }
    }

    async function decryptLastMessages(): Promise<void> {
        await Promise.allSettled(
            dmGroups.value
                .filter((g) => g.last_message && !g.last_message.decrypted_content)
                .map((g) => decryptLastMessage(g)),
        );
    }

    function clearCurrentDm(): void {
        currentDmGroup.value = null;
        messages.value = [];
        nextCursor.value = null;
        prevCursor.value = null;
    }

    function $reset(): void {
        dmGroups.value = [];
        currentDmGroup.value = null;
        messages.value = [];
        nextCursor.value = null;
        prevCursor.value = null;
        isLoadingGroups.value = false;
        isLoadingMessages.value = false;
        isLoadingMore.value = false;
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
        decryptLastMessages,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useDirectMessagesStore, import.meta.hot));
}
