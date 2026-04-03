import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { createDmGroup, findDmGroup, getDmMessages } from '@/api/direct-messages';
import { normalizeMessages } from '@/api/normalizers';
import { useE2EE } from '@/composables/useE2EE';
import type { AvatarUrls, MessageData } from '@/types/chat';

function extractCursor(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        return new URL(url).searchParams.get('cursor');
    } catch {
        return url;
    }
}

export interface DmGroup {
    id: string;
    name: string;
    other_user: {
        id: string;
        username: string;
        avatar_urls: AvatarUrls | null;
    } | null;
    last_message: {
        id: string;
        content: string;
        created_at: string;
        user_id: string;
        sender_device_id?: string;
        decrypted_content?: string;
        decrypt_error?: boolean;
    } | null;
    last_message_at: string | null;
}

export interface CurrentDmGroup {
    id: string;
    name: string;
    other_user?: {
        id: string;
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

    async function decryptLastMessage(group: DmGroup): Promise<void> {
        const lm = group.last_message;
        if (!lm || lm.decrypted_content || lm.decrypt_error) return;

        const e2ee = useE2EE();

        // Always try cache first to avoid consuming MLS ratchet keys
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
            const plaintext = await e2ee.decrypt(lm.content, undefined, Number(group.id), Number(lm.id));
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

    async function fetchMessages(groupId: string): Promise<void> {
        isLoadingMessages.value = true;
        messages.value = [];
        nextCursor.value = null;
        prevCursor.value = null;
        try {
            const response = await getDmMessages(groupId);
            messages.value = normalizeMessages(response.data, response.included);
            prevCursor.value = extractCursor(response.links?.prev);
            nextCursor.value = extractCursor(response.links?.next);
        } catch (error) {
            console.error('Failed to fetch DM messages:', error);
        } finally {
            isLoadingMessages.value = false;
        }
    }

    async function loadOlderMessages(): Promise<void> {
        if (!currentDmGroup.value || !prevCursor.value || isLoadingMore.value) return;
        isLoadingMore.value = true;
        try {
            const response = await getDmMessages(currentDmGroup.value.id, { cursor: prevCursor.value });
            const older = normalizeMessages(response.data, response.included);
            messages.value = [...older, ...messages.value];
            prevCursor.value = extractCursor(response.links?.prev);
        } catch (error) {
            console.error('Failed to load older DM messages:', error);
        } finally {
            isLoadingMore.value = false;
        }
    }

    async function startOrGetDm(userId: string): Promise<string | null> {
        try {
            const found = await findDmGroup(userId);
            return String(found.data.dm_group_id);
        } catch {
            // Group doesn't exist yet, create one
        }
        try {
            const created = await createDmGroup(userId);
            if ('data' in created && 'dm_group_id' in created.data) {
                return String((created.data as { dm_group_id: number }).dm_group_id);
            }
            return created.data.id;
        } catch (error) {
            console.error('Failed to create DM group:', error);
            return null;
        }
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
        addMessage,
        updateMessage,
        removeMessage,
        fetchMessages,
        loadOlderMessages,
        startOrGetDm,
        clearCurrentDm,
        decryptLastMessages,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useDirectMessagesStore, import.meta.hot));
}
