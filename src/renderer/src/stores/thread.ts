import { acceptHMRUpdate, defineStore } from 'pinia';
import { ref } from 'vue';
import { normalizeMessage, normalizeMessages } from '@/api/normalizers';
import {
    getThreadMessages,
    createThreadReply,
    editThreadMessage,
    deleteThreadMessage,
    toggleThreadReaction,
    followThread as apiFollowThread,
    unfollowThread as apiUnfollowThread,
} from '@/api/threads';
import type { MessageData, ThreadPreview } from '@/types/chat';

export const useThreadStore = defineStore('thread', () => {
    const activeThread = ref<ThreadPreview | null>(null);
    const parentMessage = ref<MessageData | null>(null);
    const threadMessages = ref<MessageData[]>([]);
    const isLoadingThread = ref(false);
    const isLoadingMessages = ref(false);
    const isLoadingMore = ref(false);
    const nextCursor = ref<string | null>(null);
    const prevCursor = ref<string | null>(null);

    async function openThread(channelId: string | number, message: MessageData): Promise<void> {
        parentMessage.value = message;
        threadMessages.value = [];
        activeThread.value = message.thread ?? null;

        if (message.thread) {
            isLoadingMessages.value = true;
            try {
                const response = await getThreadMessages(String(channelId), String(message.thread.id));
                threadMessages.value = normalizeMessages(response.data, response.included);
                nextCursor.value = response.links?.next ?? null;
                prevCursor.value = response.links?.prev ?? null;
            } catch (error) {
                console.error('Failed to fetch thread messages:', error);
            } finally {
                isLoadingMessages.value = false;
            }
        }
    }

    function closeThread(): void {
        activeThread.value = null;
        parentMessage.value = null;
        threadMessages.value = [];
        nextCursor.value = null;
        prevCursor.value = null;
    }

    async function loadOlderMessages(channelId: string | number): Promise<void> {
        if (!activeThread.value || !prevCursor.value || isLoadingMore.value) return;

        isLoadingMore.value = true;
        try {
            const response = await getThreadMessages(String(channelId), String(activeThread.value.id), {
                cursor: prevCursor.value,
            });
            const older = normalizeMessages(response.data, response.included);
            threadMessages.value = [...older, ...threadMessages.value];
            prevCursor.value = response.links?.prev ?? null;
        } catch (error) {
            console.error('Failed to load older thread messages:', error);
        } finally {
            isLoadingMore.value = false;
        }
    }

    async function sendReply(
        channelId: string | number,
        messageId: string | number,
        messageBytes: string,
        extra?: {
            sender_device_id?: string;
            mention_user_ids?: number[];
            mention_everyone?: boolean;
            mention_here?: boolean;
        },
    ): Promise<MessageData | null> {
        try {
            const response = await createThreadReply(String(channelId), String(messageId), {
                message_bytes: messageBytes,
                sender_device_id: extra?.sender_device_id ?? '',
                ...extra,
            });
            const reply = normalizeMessage(response.data, response.included);

            if (!activeThread.value && reply.thread_id) {
                activeThread.value = {
                    id: reply.thread_id,
                    message_count: 1,
                    last_message_at: reply.created_at,
                    is_following: true,
                    last_reply: {
                        id: reply.id,
                        content: reply.content,
                        user: reply.user,
                        created_at: reply.created_at,
                        sender_device_id: reply.sender_device_id,
                    },
                };
            }

            return reply;
        } catch (error) {
            console.error('Failed to send thread reply:', error);
            return null;
        }
    }

    async function editMessage(
        channelId: string | number,
        threadId: string | number,
        messageId: string | number,
        messageBytes: string,
        extra?: {
            sender_device_id?: string;
        },
    ): Promise<void> {
        try {
            await editThreadMessage(String(channelId), String(threadId), String(messageId), {
                message_bytes: messageBytes,
                sender_device_id: extra?.sender_device_id ?? '',
                ...extra,
            });
            const msg = threadMessages.value.find((m) => m.id === String(messageId));
            if (msg) {
                msg.is_edited = true;
                msg.edited_at = new Date().toISOString();
            }
        } catch (error) {
            console.error('Failed to edit thread message:', error);
        }
    }

    async function deleteMessage(
        channelId: string | number,
        threadId: string | number,
        messageId: string | number,
    ): Promise<void> {
        try {
            await deleteThreadMessage(String(channelId), String(threadId), String(messageId));
            const idx = threadMessages.value.findIndex((m) => m.id === String(messageId));
            if (idx !== -1) threadMessages.value.splice(idx, 1);
        } catch (error) {
            console.error('Failed to delete thread message:', error);
        }
    }

    async function toggleReaction(
        channelId: string | number,
        threadId: string | number,
        messageId: string | number,
        emoji: string,
        currentUserId: string | number,
    ): Promise<void> {
        try {
            const r = await toggleThreadReaction(String(channelId), String(threadId), String(messageId), { emoji });
            const responseData = r as { data?: unknown; meta?: { added: boolean } };
            const msg = threadMessages.value.find((m) => m.id === String(messageId));
            if (msg && responseData.meta) {
                if (!msg.reactions) msg.reactions = [];
                if (responseData.meta.added) {
                    msg.reactions.push({
                        id: String((responseData.data as { id?: number })?.id ?? 0),
                        message_id: String(messageId),
                        user_id: String(currentUserId),
                        emoji,
                    });
                } else {
                    const idx = msg.reactions.findIndex(
                        (r) => r.user_id === String(currentUserId) && r.emoji === emoji,
                    );
                    if (idx !== -1) msg.reactions.splice(idx, 1);
                }
            }
        } catch (error) {
            console.error('Failed to toggle thread reaction:', error);
        }
    }

    async function followThread(channelId: string | number, threadId: string | number): Promise<void> {
        try {
            await apiFollowThread(String(channelId), String(threadId));
            if (activeThread.value) {
                activeThread.value.is_following = true;
            }
        } catch (error) {
            console.error('Failed to follow thread:', error);
        }
    }

    async function unfollowThread(channelId: string | number, threadId: string | number): Promise<void> {
        try {
            await apiUnfollowThread(String(channelId), String(threadId));
            if (activeThread.value) {
                activeThread.value.is_following = false;
            }
        } catch (error) {
            console.error('Failed to unfollow thread:', error);
        }
    }

    function addThreadMessage(message: MessageData): void {
        const exists = threadMessages.value.some((m) => m.id === message.id);
        if (!exists) {
            threadMessages.value.push(message);
        }
    }

    function updateThreadMessage(messageId: string | number, partial: Partial<MessageData>): void {
        const id = String(messageId);
        const idx = threadMessages.value.findIndex((m) => m.id === id);
        if (idx !== -1) {
            Object.assign(threadMessages.value[idx], partial);
        }
    }

    function removeThreadMessage(messageId: string | number): void {
        const id = String(messageId);
        const idx = threadMessages.value.findIndex((m) => m.id === id);
        if (idx !== -1) threadMessages.value.splice(idx, 1);
    }

    function $reset(): void {
        activeThread.value = null;
        parentMessage.value = null;
        threadMessages.value = [];
        isLoadingThread.value = false;
        isLoadingMessages.value = false;
        isLoadingMore.value = false;
        nextCursor.value = null;
        prevCursor.value = null;
    }

    return {
        activeThread,
        parentMessage,
        threadMessages,
        isLoadingThread,
        isLoadingMessages,
        isLoadingMore,
        nextCursor,
        prevCursor,
        openThread,
        closeThread,
        loadOlderMessages,
        sendReply,
        editMessage,
        deleteMessage,
        toggleReaction,
        followThread,
        unfollowThread,
        addThreadMessage,
        updateThreadMessage,
        removeThreadMessage,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useThreadStore, import.meta.hot));
}
