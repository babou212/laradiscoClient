import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '@/lib/api';
import type { MessageData, MessagesResponse, ThreadPreview } from '@/types/chat';

export const useThreadStore = defineStore('thread', () => {
    const activeThread = ref<ThreadPreview | null>(null);
    const parentMessage = ref<MessageData | null>(null);
    const threadMessages = ref<MessageData[]>([]);
    const isLoadingThread = ref(false);
    const isLoadingMessages = ref(false);
    const isLoadingMore = ref(false);
    const nextCursor = ref<string | null>(null);
    const prevCursor = ref<string | null>(null);

    async function openThread(channelId: number, message: MessageData): Promise<void> {
        parentMessage.value = message;
        threadMessages.value = [];
        activeThread.value = message.thread ?? null;

        if (message.thread) {
            isLoadingMessages.value = true;
            try {
                const response = await api.get(`/channels/${channelId}/threads/${message.thread.id}/messages`);
                const data = response.data as MessagesResponse;
                threadMessages.value = data.data ?? [];
                nextCursor.value = data.next_cursor ?? null;
                prevCursor.value = data.prev_cursor ?? null;
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

    async function loadOlderMessages(channelId: number): Promise<void> {
        if (!activeThread.value || !prevCursor.value || isLoadingMore.value) return;

        isLoadingMore.value = true;
        try {
            const response = await api.get(`/channels/${channelId}/threads/${activeThread.value.id}/messages`, {
                params: { cursor: prevCursor.value },
            });
            const data = response.data as MessagesResponse;
            threadMessages.value = [...(data.data ?? []), ...threadMessages.value];
            prevCursor.value = data.prev_cursor ?? null;
        } catch (error) {
            console.error('Failed to load older thread messages:', error);
        } finally {
            isLoadingMore.value = false;
        }
    }

    async function sendReply(
        channelId: number,
        messageId: number,
        content: string,
        extra?: {
            is_encrypted?: boolean;
            sender_device_id?: string;
            search_tokens?: string[];
            mention_user_ids?: number[];
            mention_everyone?: boolean;
            mention_here?: boolean;
        },
    ): Promise<MessageData | null> {
        try {
            const response = await api.post(`/channels/${channelId}/messages/${messageId}/thread`, {
                content,
                ...extra,
            });
            const reply = response.data as MessageData;

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
                        is_encrypted: reply.is_encrypted,
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
        channelId: number,
        threadId: number,
        messageId: number,
        content: string,
        extra?: {
            is_encrypted?: boolean;
            sender_device_id?: string;
            search_tokens?: string[];
        },
    ): Promise<void> {
        try {
            await api.put(`/channels/${channelId}/threads/${threadId}/messages/${messageId}`, { content, ...extra });
            const msg = threadMessages.value.find((m) => m.id === messageId);
            if (msg) {
                msg.content = content;
                msg.is_edited = true;
                msg.edited_at = new Date().toISOString();
                if (extra?.is_encrypted) {
                    msg.is_encrypted = true;
                }
            }
        } catch (error) {
            console.error('Failed to edit thread message:', error);
        }
    }

    async function deleteMessage(channelId: number, threadId: number, messageId: number): Promise<void> {
        try {
            await api.delete(`/channels/${channelId}/threads/${threadId}/messages/${messageId}`);
            const idx = threadMessages.value.findIndex((m) => m.id === messageId);
            if (idx !== -1) threadMessages.value.splice(idx, 1);
        } catch (error) {
            console.error('Failed to delete thread message:', error);
        }
    }

    async function toggleReaction(
        channelId: number,
        threadId: number,
        messageId: number,
        emoji: string,
        currentUserId: number,
    ): Promise<void> {
        try {
            const response = await api.post(
                `/channels/${channelId}/threads/${threadId}/messages/${messageId}/reactions`,
                { emoji },
            );
            const msg = threadMessages.value.find((m) => m.id === messageId);
            if (msg && response.data) {
                if (!msg.reactions) msg.reactions = [];
                if ((response.data as any).added) {
                    msg.reactions.push({
                        id: (response.data as any).reaction?.id ?? 0,
                        message_id: messageId,
                        user_id: currentUserId,
                        emoji,
                    });
                } else {
                    const idx = msg.reactions.findIndex((r) => r.user_id === currentUserId && r.emoji === emoji);
                    if (idx !== -1) msg.reactions.splice(idx, 1);
                }
            }
        } catch (error) {
            console.error('Failed to toggle thread reaction:', error);
        }
    }

    async function followThread(channelId: number, threadId: number): Promise<void> {
        try {
            await api.post(`/channels/${channelId}/threads/${threadId}/follow`);
            if (activeThread.value) {
                activeThread.value.is_following = true;
            }
        } catch (error) {
            console.error('Failed to follow thread:', error);
        }
    }

    async function unfollowThread(channelId: number, threadId: number): Promise<void> {
        try {
            await api.delete(`/channels/${channelId}/threads/${threadId}/follow`);
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

    function updateThreadMessage(messageId: number, partial: Partial<MessageData>): void {
        const idx = threadMessages.value.findIndex((m) => m.id === messageId);
        if (idx !== -1) {
            Object.assign(threadMessages.value[idx], partial);
        }
    }

    function removeThreadMessage(messageId: number): void {
        const idx = threadMessages.value.findIndex((m) => m.id === messageId);
        if (idx !== -1) threadMessages.value.splice(idx, 1);
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
    };
});
