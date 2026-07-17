import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { createDmGroup, getDmGroups, getDmMessages } from '@/api/direct-messages';
import { normalizeMessages } from '@/api/normalizers';
import { readPageMeta } from '@/api/pagination';
import { useAuthStore } from '@/stores/auth';
import { useServerStore } from '@/stores/server';
import type { AvatarUrls, MessageData } from '@/types/chat';

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
        content: string | null;
        created_at: string;
        user_id: string;
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
    const oldestId = ref<string | null>(null);
    const newestId = ref<string | null>(null);
    const hasMoreBefore = ref(false);
    const hasMoreAfter = ref(false);
    const isLoadingGroups = ref(false);
    const isLoadingMessages = ref(false);
    const isLoadingMore = ref(false);

    const selectedDmGroupId = computed(() => currentDmGroup.value?.id ?? null);
    const isViewingHistory = computed(() => hasMoreAfter.value);

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
            };
            group.last_message_at = message.created_at;
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

    async function fetchDmGroups(): Promise<void> {
        isLoadingGroups.value = true;
        try {
            const response = await getDmGroups();
            dmGroups.value = response.data.map((resource) => {
                const attrs = resource.attributes;

                const otherUser = attrs.other_user;

                const lastMsg = attrs.last_message;
                const lastMessage: DmGroup['last_message'] = lastMsg
                    ? {
                          id: String(lastMsg.id),
                          content: lastMsg.content ?? '',
                          created_at: lastMsg.created_at ?? '',
                          user_id: String(lastMsg.user_id),
                      }
                    : null;

                return {
                    id: resource.id,
                    name: otherUser?.username ?? 'Unknown',
                    other_user: otherUser ?? null,
                    last_message: lastMessage,
                    last_message_at: attrs.last_message_at ?? lastMessage?.created_at ?? null,
                };
            });
        } catch (error) {
            console.error('Failed to fetch DM groups:', error);
        } finally {
            isLoadingGroups.value = false;
        }
    }

    async function selectDmGroup(groupId: number | string): Promise<void> {
        const id = String(groupId);
        const group = dmGroups.value.find((g) => g.id === id);
        if (group) {
            currentDmGroup.value = {
                id: group.id,
                name: group.name,
                other_user: group.other_user ?? undefined,
            };
        } else {
            currentDmGroup.value = { id, name: 'Direct Message' };
        }

        const host = useServerStore().activeHost;
        const token = useAuthStore().token;
        if (host && token) {
            try {
                await window.api.mls.establishDmGroup(host, token, Number(id));
                await window.api.mls.syncDmGroup(host, token, Number(id));
            } catch {
                // Best-effort: E2EE not ready yet; messages that need decryption
                // will show a placeholder until sync succeeds.
            }
        }

        await fetchMessages(id);
    }

    async function fetchMessages(groupId: string): Promise<void> {
        isLoadingMessages.value = true;
        messages.value = [];
        oldestId.value = null;
        newestId.value = null;
        hasMoreBefore.value = false;
        hasMoreAfter.value = false;
        try {
            const response = await getDmMessages(groupId);
            messages.value = await decryptDmMessages(groupId, normalizeMessages(response.data, response.included));
            const meta = readPageMeta(response.meta);
            hasMoreBefore.value = meta.hasMoreBefore;
            hasMoreAfter.value = meta.hasMoreAfter;
            oldestId.value = meta.oldestId;
            newestId.value = meta.newestId;
            await mergeOutbox(groupId);
        } catch (error) {
            console.error('Failed to fetch DM messages:', error);
        } finally {
            isLoadingMessages.value = false;
        }
    }

    async function decryptDmMessages(groupId: string, msgs: MessageData[]): Promise<MessageData[]> {
        await Promise.all(
            msgs.map(async (m) => {
                if (!m.message_bytes) return;
                m.content =
                    (await window.api.mls.decryptDm(Number(groupId), m.id, m.message_bytes)) ?? '[unable to decrypt]';
            }),
        );
        return msgs;
    }

    async function mergeOutbox(groupId: string): Promise<void> {
        const rows = await window.api.outbox.listForChannel(groupId, true);
        for (const row of rows) {
            if (messages.value.some((m) => m.id === row.client_temp_id)) continue;
            const optimistic = JSON.parse(row.optimistic) as MessageData;
            optimistic.send_status = 'failed';
            messages.value.push(optimistic);
        }
    }

    async function loadOlderMessages(): Promise<void> {
        if (!currentDmGroup.value || !hasMoreBefore.value || !oldestId.value || isLoadingMore.value) return;
        isLoadingMore.value = true;
        try {
            const response = await getDmMessages(currentDmGroup.value.id, { before: oldestId.value });
            const older = await decryptDmMessages(currentDmGroup.value.id, normalizeMessages(response.data, response.included));
            const meta = readPageMeta(response.meta);
            if (older.length > 0) {
                messages.value = [...older, ...messages.value];
                if (meta.oldestId) oldestId.value = meta.oldestId;
            }
            hasMoreBefore.value = meta.hasMoreBefore;
        } catch (error) {
            console.error('Failed to load older DM messages:', error);
        } finally {
            isLoadingMore.value = false;
        }
    }

    async function loadNewerMessages(): Promise<void> {
        if (!currentDmGroup.value || !hasMoreAfter.value || !newestId.value || isLoadingMore.value) return;
        isLoadingMore.value = true;
        try {
            const response = await getDmMessages(currentDmGroup.value.id, { after: newestId.value });
            const newer = await decryptDmMessages(currentDmGroup.value.id, normalizeMessages(response.data, response.included));
            const meta = readPageMeta(response.meta);
            if (newer.length > 0) {
                messages.value = [...messages.value, ...newer];
                if (meta.newestId) newestId.value = meta.newestId;
            }
            hasMoreAfter.value = meta.hasMoreAfter;
        } catch (error) {
            console.error('Failed to load newer DM messages:', error);
        } finally {
            isLoadingMore.value = false;
        }
    }

    async function loadMessagesAround(messageId: string): Promise<void> {
        if (!currentDmGroup.value) return;
        isLoadingMessages.value = true;
        try {
            const response = await getDmMessages(currentDmGroup.value.id, { around: messageId });
            messages.value = await decryptDmMessages(
                currentDmGroup.value.id,
                normalizeMessages(response.data, response.included),
            );
            const meta = readPageMeta(response.meta);
            hasMoreBefore.value = meta.hasMoreBefore;
            hasMoreAfter.value = meta.hasMoreAfter;
            oldestId.value = meta.oldestId;
            newestId.value = meta.newestId;
        } catch (error) {
            console.error('Failed to load DM messages around target:', error);
        } finally {
            isLoadingMessages.value = false;
        }
    }

    async function startOrGetDm(userId: string): Promise<string | null> {
        // createDmGroup is get-or-create: returns the existing group (200) or a new one (201).
        try {
            const created = await createDmGroup(userId);
            if ('data' in created && 'dm_group_id' in created.data) {
                return String((created.data as { dm_group_id: number }).dm_group_id);
            }
            return (created as { data: { id: string } }).data.id;
        } catch (error) {
            console.error('Failed to create DM group:', error);
            return null;
        }
    }

    function clearCurrentDm(): void {
        currentDmGroup.value = null;
        messages.value = [];
        oldestId.value = null;
        newestId.value = null;
        hasMoreBefore.value = false;
        hasMoreAfter.value = false;
    }

    function $reset(): void {
        dmGroups.value = [];
        currentDmGroup.value = null;
        messages.value = [];
        oldestId.value = null;
        newestId.value = null;
        hasMoreBefore.value = false;
        hasMoreAfter.value = false;
        isLoadingGroups.value = false;
        isLoadingMessages.value = false;
        isLoadingMore.value = false;
    }

    return {
        dmGroups,
        currentDmGroup,
        messages,
        oldestId,
        newestId,
        hasMoreBefore,
        hasMoreAfter,
        isLoadingGroups,
        isLoadingMessages,
        isLoadingMore,
        selectedDmGroupId,
        isViewingHistory,
        addMessage,
        updateMessage,
        removeMessage,
        fetchDmGroups,
        selectDmGroup,
        fetchMessages,
        loadOlderMessages,
        loadNewerMessages,
        loadMessagesAround,
        startOrGetDm,
        clearCurrentDm,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useDirectMessagesStore, import.meta.hot));
}
