import { onUnmounted, watch } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { coerceBroadcastMessage } from '@/api/normalizers';
import { getEcho } from '@/lib/echo';
import { useThreadStore } from '@/stores/thread';
import { useUsersStore } from '@/stores/users';
import type { AvatarUrls, MessageData, MessageReaction, ThreadPreview } from '@/types/chat';

interface ChannelRealtimeOptions {
    channelId: Ref<string | undefined>;
    isDm: Ref<boolean>;
    messages: ComputedRef<MessageData[]>;
    isLoadingMessages: ComputedRef<boolean>;
    isViewingHistory: Ref<boolean>;
    addMessage: (msg: MessageData) => void;
    updateMessage: (id: string, partial: Partial<MessageData>) => void;
    removeMessage: (id: string) => void;
    notifyNewMessage: () => void;
    resetForNewChannel: () => void;
    handleTypingEvent: (data: { user_id: number; username: string; is_typing: boolean }) => void;
    clearTypingUser: (userId: number) => void;
    clearAll: () => void;
    pinnedMessages: Ref<MessageData[]>;
    showPinnedMessages: Ref<boolean>;
    fetchAndDecryptPinned: () => Promise<void>;
}

export function useChannelRealtime(options: ChannelRealtimeOptions) {
    const {
        channelId,
        isDm,
        messages,
        isViewingHistory,
        addMessage,
        updateMessage,
        removeMessage,
        notifyNewMessage,
        resetForNewChannel,
        handleTypingEvent,
        clearTypingUser,
        clearAll,
        pinnedMessages,
        showPinnedMessages,
        fetchAndDecryptPinned,
    } = options;

    const threadStore = useThreadStore();

    let currentChannelListener: string | null = null;

    function leaveChannel() {
        if (currentChannelListener) {
            const echo = getEcho();
            if (echo) {
                echo.leave(currentChannelListener);
            }
            currentChannelListener = null;
        }
        clearAll();
    }

    function joinChannel(cId: string, dm: boolean = false) {
        leaveChannel();
        const echo = getEcho();
        if (!echo) return;

        currentChannelListener = dm ? `direct-message.${cId}` : `channel.${cId}`;

        echo.join(currentChannelListener)
            .listen('MessageSent', (data: { message: MessageData }) => {
                coerceBroadcastMessage(data.message);
                if (!data.message.reply_to && data.message.reply_to_id) {
                    const parent = messages.value.find((m) => m.id === data.message.reply_to_id);
                    if (parent) {
                        data.message.reply_to = {
                            id: parent.id,
                            content: parent.content,
                            user: parent.user,
                            link_preview: parent.link_preview,
                        };
                    }
                }
                clearTypingUser(Number(data.message.user.id));

                // Server uses ->toOthers() so we shouldn't normally receive our
                // own message; defensive dedupe in case echo replays or another
                // device of the same user posted.
                if (messages.value.some((m) => m.id === data.message.id)) {
                    return;
                }

                // While viewing an older window (not anchored to the live tail),
                // don't splice a non-contiguous message into the list — surface
                // it via the unread pill. It loads when the user returns to live.
                if (isViewingHistory.value) {
                    notifyNewMessage();
                    return;
                }

                addMessage(data.message);
                notifyNewMessage();
            })
            .listen('MessageEdited', (data: { message: MessageData }) => {
                coerceBroadcastMessage(data.message);
                updateMessage(data.message.id, {
                    content: data.message.content,
                    is_edited: true,
                    edited_at: data.message.edited_at,
                });
            })
            .listen('MessageDeleted', (data: { message_id: number | string }) => {
                removeMessage(String(data.message_id));
            })
            .listen('ReactionToggled', (data: { reaction: MessageReaction; added: boolean }) => {
                data.reaction.id = String(data.reaction.id);
                data.reaction.message_id = String(data.reaction.message_id);
                data.reaction.user_id = String(data.reaction.user_id);
                const msg = messages.value.find((m) => m.id === data.reaction.message_id);
                if (msg) {
                    if (!msg.reactions) msg.reactions = [];
                    if (data.added) {
                        const exists = msg.reactions.some(
                            (r) => String(r.user_id) === data.reaction.user_id && r.emoji === data.reaction.emoji,
                        );
                        if (!exists) {
                            msg.reactions.push(data.reaction);
                        }
                    } else {
                        const idx = msg.reactions.findIndex(
                            (r) => String(r.user_id) === data.reaction.user_id && r.emoji === data.reaction.emoji,
                        );
                        if (idx !== -1) {
                            msg.reactions.splice(idx, 1);
                        }
                    }
                }
            })
            .listen(
                'MessagePinned',
                (data: { message_id: number | string; pinned_by?: { id: number | string; username: string } }) => {
                    const pinnedMsgId = String(data.message_id);
                    const msg = messages.value.find((m) => m.id === pinnedMsgId);
                    if (msg) {
                        msg.is_pinned = true;
                        msg.pinned_at = new Date().toISOString();
                    }
                    if (showPinnedMessages.value) {
                        fetchAndDecryptPinned().catch(() => {});
                    }
                },
            )
            .listen('MessageUnpinned', (data: { message_id: number | string }) => {
                const unpinnedMsgId = String(data.message_id);
                const msg = messages.value.find((m) => m.id === unpinnedMsgId);
                if (msg) {
                    msg.is_pinned = false;
                    msg.pinned_at = null;
                }
                const pinnedIdx = pinnedMessages.value.findIndex((m) => m.id === unpinnedMsgId);
                if (pinnedIdx !== -1) pinnedMessages.value.splice(pinnedIdx, 1);
            })
            .listen('UserTyping', (data: { user_id: number; username: string; is_typing: boolean }) => {
                handleTypingEvent(data);
            })
            .listen(
                'ThreadUpdated',
                (data: {
                    message_id: number | string;
                    thread: { id: number | string; message_count: number; last_message_at: string };
                    last_reply?: {
                        id: number | string;
                        content: string;
                        user: { id: number | string; username: string; avatar_urls: AvatarUrls | null };
                        created_at: string;
                    };
                }) => {
                    const threadMsgId = String(data.message_id);
                    const msg = messages.value.find((m) => m.id === threadMsgId);
                    if (msg) {
                        const threadPreview: ThreadPreview = {
                            id: String(data.thread.id),
                            message_count: data.thread.message_count,
                            last_message_at: data.thread.last_message_at,
                            is_following: msg.thread?.is_following,
                        };
                        if (data.last_reply) {
                            threadPreview.last_reply = {
                                id: String(data.last_reply.id),
                                content: data.last_reply.content,
                                user: {
                                    id: String(data.last_reply.user.id),
                                    username: data.last_reply.user.username,
                                    avatar_urls: data.last_reply.user.avatar_urls,
                                },
                                created_at: data.last_reply.created_at,
                            };
                            if (data.last_reply.user.avatar_urls) {
                                const usersStore = useUsersStore();
                                usersStore.upsert({
                                    id: String(data.last_reply.user.id),
                                    username: data.last_reply.user.username,
                                    avatar_urls: data.last_reply.user.avatar_urls,
                                });
                            }
                        }
                        msg.thread = threadPreview;
                    }
                },
            )
            .listen(
                'ThreadDeleted',
                (data: { message_id: number | string; thread_id: number | string }) => {
                    const msg = messages.value.find((m) => m.id === String(data.message_id));
                    if (msg) {
                        msg.thread = null;
                        msg.thread_id = null;
                    }
                },
            );
    }

    // Rejoin channel when the channel id changes
    watch(
        channelId,
        (newId) => {
            if (newId) {
                joinChannel(newId, isDm.value);
                showPinnedMessages.value = false;
                pinnedMessages.value = [];
                threadStore.closeThread();
                resetForNewChannel();
            }
        },
        { immediate: true },
    );

    onUnmounted(() => {
        leaveChannel();
    });
}
