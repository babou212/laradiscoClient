import { computed, onUnmounted, watch } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { coerceBroadcastMessage } from '@/api/normalizers';
import { useE2EE } from '@/composables/useE2EE';
import { getEcho } from '@/lib/echo';
import { useAuthStore } from '@/stores/auth';
import { useE2eeStore } from '@/stores/e2ee';
import { useThreadStore } from '@/stores/thread';
import { useUsersStore } from '@/stores/users';
import type { AvatarUrls, MessageData, MessageReaction, ThreadPreview } from '@/types/chat';

interface ChannelRealtimeOptions {
    channelId: Ref<string | undefined>;
    isDm: Ref<boolean>;
    messages: ComputedRef<MessageData[]>;
    isLoadingMessages: ComputedRef<boolean>;
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
        isLoadingMessages,
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

    const authStore = useAuthStore();
    const e2eeStore = useE2eeStore();
    const e2ee = useE2EE();
    const threadStore = useThreadStore();

    const currentUser = computed(() => authStore.user);

    let currentChannelListener: string | null = null;
    let groupReadyPromise: Promise<void> | null = null;
    let pendingDecryptRetryTimer: ReturnType<typeof setInterval> | null = null;

    function clearPendingDecryptRetry() {
        if (pendingDecryptRetryTimer !== null) {
            clearInterval(pendingDecryptRetryTimer);
            pendingDecryptRetryTimer = null;
        }
    }

    function leaveChannel() {
        clearPendingDecryptRetry();
        groupReadyPromise = null;
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

        if (e2eeStore.isReady) {
            const groupId = dm ? `dm:${cId}` : `channel:${cId}`;
            const type = dm ? 'dm' : 'channel';
            groupReadyPromise = e2ee
                .ensureGroupReady(groupId, Number(cId), type)
                .then(() => {})
                .catch(() => {});
        } else {
            groupReadyPromise = null;
        }

        currentChannelListener = dm ? `direct-message.${cId}` : `channel.${cId}`;

        echo.join(currentChannelListener)
            .listen('MessageSent', async (data: { message: MessageData }) => {
                coerceBroadcastMessage(data.message);
                if (!data.message.reply_to && data.message.reply_to_id) {
                    const parent = messages.value.find((m) => m.id === data.message.reply_to_id);
                    if (parent) {
                        data.message.reply_to = {
                            id: parent.id,
                            content: parent.content,
                            user: parent.user,
                            decrypted_content: parent.decrypted_content,
                            decrypt_error: parent.decrypt_error,
                            link_preview: parent.link_preview,
                        };
                    }
                }
                const senderId = data.message.user.id;
                clearTypingUser(Number(senderId));

                if (senderId === currentUser.value?.id) {
                    let msgSenderDeviceId = data.message.sender_device_id ?? '';
                    if (!msgSenderDeviceId) {
                        try {
                            const parsed = JSON.parse(data.message.content);
                            msgSenderDeviceId = parsed.sender_device_id ?? '';
                        } catch (error) {
                            console.error(error);
                        }
                    }
                    const ourDeviceId = e2eeStore.isReady ? await e2ee.getDeviceId() : null;

                    if (!msgSenderDeviceId || !ourDeviceId || msgSenderDeviceId === ourDeviceId) {
                        return;
                    }

                    addMessage(data.message);
                    notifyNewMessage();

                    if (e2eeStore.isReady) {
                        try {
                            const chId = isDm.value ? undefined : Number(channelId.value);
                            const dmId = isDm.value ? Number(channelId.value) : undefined;
                            const inStore = messages.value.find((m) => m.id === data.message.id) ?? data.message;
                            await e2ee.decryptMessageQueued(inStore, chId, dmId);
                        } catch {
                            const inStore = messages.value.find((m) => m.id === data.message.id);
                            if (inStore && !inStore.decrypted_content) {
                                inStore.decrypted_content = '[Message sent from another device]';
                            }
                        }
                    } else {
                        const inStore = messages.value.find((m) => m.id === data.message.id);
                        if (inStore) inStore.decrypted_content = '[Message sent from another device]';
                    }
                    return;
                }

                addMessage(data.message);
                notifyNewMessage();

                if (e2eeStore.isReady) {
                    const chId = isDm.value ? undefined : Number(channelId.value);
                    const dmId = isDm.value ? Number(channelId.value) : undefined;
                    const inStore = messages.value.find((m) => m.id === data.message.id) ?? data.message;
                    await e2ee.decryptMessageQueued(inStore, chId, dmId);
                }
            })
            .listen('MessageEdited', async (data: { message: MessageData }) => {
                coerceBroadcastMessage(data.message);
                const update: Partial<MessageData> = {
                    content: data.message.content,
                    is_edited: true,
                    edited_at: data.message.edited_at,
                };

                if (e2eeStore.isReady) {
                    const ourDeviceId = await e2ee.getDeviceId();
                    if (ourDeviceId && data.message.sender_device_id === ourDeviceId) {
                        const temp: MessageData[] = [
                            { ...data.message, decrypted_content: undefined, decrypt_error: false },
                        ];
                        await e2ee.lookupDecryptedCache(temp);
                        if (temp[0].decrypted_content) {
                            update.decrypted_content = temp[0].decrypted_content;
                            update.decrypted_attachments = temp[0].decrypted_attachments;
                            update.decrypt_error = false;
                        } else {
                            update.decrypt_error = true;
                        }
                    } else {
                        try {
                            const chId = isDm.value ? undefined : Number(channelId.value);
                            const dmId = isDm.value ? Number(channelId.value) : undefined;
                            const plaintext = await e2ee.decrypt(
                                data.message.content,
                                chId,
                                dmId,
                                Number(data.message.id),
                                data.message.user?.username,
                            );
                            update.decrypted_content = plaintext.text;
                            update.decrypted_attachments = plaintext.attachments;
                            update.decrypt_error = false;
                        } catch {
                            update.decrypt_error = true;
                        }
                    }
                }

                updateMessage(data.message.id, update);
            })
            .listen('MessageDeleted', (data: { message_id: number | string }) => {
                const msgId = String(data.message_id);
                removeMessage(msgId);
                e2ee.removeFromSearchIndex(Number(data.message_id)).catch(() => {});
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
                'MlsMessageReceived',
                async (data: { group_id: string; message_type: string; epoch: number; sender_device_id: string }) => {
                    if (e2eeStore.isReady) {
                        try {
                            await e2ee.handleMlsMessage(data.group_id, data);
                            const chId = isDm.value ? undefined : Number(channelId.value);
                            const dmId = isDm.value ? Number(channelId.value) : undefined;
                            await e2ee.retryPendingDecryptions(messages.value, chId, dmId);
                        } catch (error) {
                            console.error(error);
                        }
                    }
                },
            )
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
                        sender_device_id?: string;
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
                                ...data.last_reply,
                                id: String(data.last_reply.id),
                                user: {
                                    ...data.last_reply.user,
                                    id: String(data.last_reply.user.id),
                                },
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

    watch(isLoadingMessages, async (loading, wasLoading) => {
        if (wasLoading && !loading) {
            if (e2eeStore.isReady && channelId.value) {
                await e2ee.lookupDecryptedCache(messages.value);

                const hasUnresolved = messages.value.some((m) => m.decrypted_content === undefined && !m.decrypt_error);

                if (hasUnresolved) {
                    if (groupReadyPromise) {
                        await groupReadyPromise;
                        groupReadyPromise = null;
                    }

                    const stillUnresolved = messages.value.some(
                        (m) => m.decrypted_content === undefined && !m.decrypt_error,
                    );
                    if (stillUnresolved) {
                        await e2ee.lookupDecryptedCache(messages.value);
                    }

                    const chId = isDm.value ? undefined : Number(channelId.value);
                    const dmId = isDm.value ? Number(channelId.value) : undefined;
                    await e2ee.decryptMessages(messages.value, chId, dmId);

                    clearPendingDecryptRetry();
                    let retryCount = 0;
                    pendingDecryptRetryTimer = setInterval(async () => {
                        retryCount++;
                        const hasPending = messages.value.some(
                            (m) => m.decrypted_content === undefined && !m.decrypt_error,
                        );
                        if (!hasPending || retryCount > 3) {
                            clearPendingDecryptRetry();
                            return;
                        }
                        if (channelId.value) {
                            const chId = isDm.value ? undefined : Number(channelId.value);
                            const dmId = isDm.value ? Number(channelId.value) : undefined;
                            await e2ee.retryPendingDecryptions(messages.value, chId, dmId);
                        }
                    }, 15_000);
                }
            }
        }
    });

    onUnmounted(() => {
        leaveChannel();
        clearPendingDecryptRetry();
    });
}
