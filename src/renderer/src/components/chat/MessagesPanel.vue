<script setup lang="ts">
import { Hash, MessageSquare, ShieldCheck, Search } from 'lucide-vue-next';
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import Message from './Message.vue';
import MessageInput from './MessageInput.vue';
import SearchMessages from './SearchMessages.vue';
import TypingIndicator from './TypingIndicator.vue';
import EncryptionBadge from '@/components/e2ee/EncryptionBadge.vue';
import NotificationBell from '@/components/NotificationBell.vue';
import { useE2EE } from '@/composables/useE2EE';
import { useEncryptedSearch } from '@/composables/useEncryptedSearch';
import api from '@/lib/api';
import { getEcho } from '@/lib/echo';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import { useDirectMessagesStore } from '@/stores/directMessages';
import { useE2eeStore } from '@/stores/e2ee';
import { usePresenceStore } from '@/stores/presence';
import type { MessageData, MessageReaction, ChannelPermissions } from '@/types/chat';

type ChannelData = {
    id: number;
    name: string;
    topic?: string | null;
    other_user?: {
        id: number;
        username: string;
        avatar_path: string | null;
    };
};

type Props = {
    channel?: ChannelData;
    isDm?: boolean;
    channelPermissions?: ChannelPermissions;
};

const props = withDefaults(defineProps<Props>(), {
    isDm: false,
});

const authStore = useAuthStore();
const chatStore = useChatStore();
const dmStore = useDirectMessagesStore();
const e2eeStore = useE2eeStore();
const presenceStore = usePresenceStore();
const e2ee = useE2EE();
const { generateTokensForMessage } = useEncryptedSearch();
const currentUser = computed(() => authStore.user);
const sendError = ref<string | null>(null);
const showSearch = ref(false);

function extractMentionMetadata(content: string): {
    userIds: number[];
    mentionEveryone: boolean;
    mentionHere: boolean;
} {
    const mentionEveryone = /@everyone\b/.test(content);
    const mentionHere = /@here\b/.test(content);

    const userIds: number[] = [];
    const matches = content.matchAll(/@(\w+)/g);
    for (const match of matches) {
        const name = match[1];
        if (name === 'everyone' || name === 'here') continue;
        const member = presenceStore.allMembers.find((m) => m.username?.toLowerCase() === name.toLowerCase());
        if (member) {
            userIds.push(member.id);
        }
    }

    return { userIds: [...new Set(userIds)], mentionEveryone, mentionHere };
}

const activeMessages = computed(() => (props.isDm ? dmStore.messages : chatStore.messages));
const activeAddMessage = (msg: MessageData) => (props.isDm ? dmStore.addMessage(msg) : chatStore.addMessage(msg));
const activeUpdateMessage = (id: number, partial: Partial<MessageData>) =>
    props.isDm ? dmStore.updateMessage(id, partial) : chatStore.updateMessage(id, partial);
const activeRemoveMessage = (id: number) => (props.isDm ? dmStore.removeMessage(id) : chatStore.removeMessage(id));
const activeLoadOlderMessages = () => (props.isDm ? dmStore.loadOlderMessages() : chatStore.loadOlderMessages());

const messagesContainer = ref<HTMLElement>();
const editingMessageId = ref<number | null>(null);
const editContent = ref('');
const emojiPickerMessageId = ref<number | null>(null);
const replyingToMessage = ref<MessageData | null>(null);
const showSafetyNumber = ref(false);
const isLoadingMore = ref(false);
const userIsNearBottom = ref(true);

const isStoreLoadingMessages = computed(() => (props.isDm ? dmStore.isLoadingMessages : chatStore.isLoadingMessages));

const typingUsers = reactive(new Map<number, { username: string; timeout: ReturnType<typeof setTimeout> }>());
let typingDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const handleClickOutside = (e: MouseEvent) => {
    if (emojiPickerMessageId.value !== null) {
        const target = e.target as HTMLElement;
        const emojiPicker = target.closest('.emoji-picker-container');
        const reactionButton = target.closest('[data-reaction-button]');
        if (!emojiPicker && !reactionButton) {
            emojiPickerMessageId.value = null;
        }
    }
};

const checkIfNearBottom = () => {
    if (!messagesContainer.value) return true;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;
    return scrollHeight - scrollTop - clientHeight < 150;
};

let scrollRetryTimer: ReturnType<typeof setInterval> | null = null;

const cancelScrollRetry = () => {
    if (scrollRetryTimer !== null) {
        clearInterval(scrollRetryTimer);
        scrollRetryTimer = null;
    }
};

const scrollToBottom = (force = false) => {
    cancelScrollRetry();

    const doScroll = () => {
        if (!messagesContainer.value) return;
        if (!force && !userIsNearBottom.value) return;
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    };

    nextTick(() => {
        doScroll();
    });

    if (force) {
        let elapsed = 0;
        scrollRetryTimer = setInterval(() => {
            elapsed += 50;
            doScroll();
            if (elapsed >= 500) {
                cancelScrollRetry();
            }
        }, 50);
    }
};

let currentChannelListener: string | null = null;

let senderKeyFetchPromise: Promise<void> | null = null;

let pendingDecryptRetryTimer: ReturnType<typeof setInterval> | null = null;

const clearPendingDecryptRetry = () => {
    if (pendingDecryptRetryTimer !== null) {
        clearInterval(pendingDecryptRetryTimer);
        pendingDecryptRetryTimer = null;
    }
};

const joinChannel = (channelId: number, isDm: boolean = false) => {
    leaveChannel();
    const echo = getEcho();
    if (!echo) return;

    if (e2eeStore.isReady) {
        if (isDm) {
            senderKeyFetchPromise = e2ee
                .fetchAndProcessDmSenderKeys(channelId)
                .then(() => e2ee.requestDmSenderKeys(channelId))
                .then(() => {})
                .catch(() => {});
        } else {
            senderKeyFetchPromise = e2ee
                .fetchAndProcessSenderKeys(channelId)
                .then(() => e2ee.requestSenderKeys(channelId))
                .then(() => {})
                .catch(() => {});
        }
    } else {
        senderKeyFetchPromise = null;
    }

    currentChannelListener = isDm ? `direct-message.${channelId}` : `channel.${channelId}`;

    echo.join(currentChannelListener)
        .listen('MessageSent', async (data: { message: MessageData }) => {
            const senderId = data.message.user.id;
            const existingTyping = typingUsers.get(senderId);
            if (existingTyping) {
                clearTimeout(existingTyping.timeout);
                typingUsers.delete(senderId);
            }

            if (senderId === currentUser.value?.id) {
                let msgSenderDeviceId = data.message.sender_device_id ?? '';
                if (!msgSenderDeviceId && data.message.is_encrypted) {
                    try {
                        const parsed = JSON.parse(data.message.content);
                        msgSenderDeviceId = parsed.sender_device_id ?? '';
                    } catch {
                        /* not valid JSON */
                    }
                }
                const ourDeviceId = e2eeStore.isReady ? await e2ee.getDeviceId() : null;

                if (!msgSenderDeviceId || !ourDeviceId || msgSenderDeviceId === ourDeviceId) {
                    return;
                }

                if (data.message.is_encrypted && e2eeStore.isReady) {
                    try {
                        const chId = props.isDm ? undefined : props.channel?.id;
                        const dmId = props.isDm ? props.channel?.id : undefined;
                        await e2ee.decryptMessageQueued(data.message, chId, dmId);
                    } catch {
                        if (!data.message.decrypted_content) {
                            data.message.decrypted_content = '[Message sent from another device]';
                        }
                    }
                } else if (!data.message.is_encrypted) {
                    // Unencrypted message from another device — display as-is
                } else {
                    data.message.decrypted_content = '[Message sent from another device]';
                }

                activeAddMessage(data.message);
                scrollToBottom();
                return;
            }

            if (data.message.is_encrypted && e2eeStore.isReady) {
                const chId = props.isDm ? undefined : props.channel?.id;
                const dmId = props.isDm ? props.channel?.id : undefined;
                await e2ee.decryptMessageQueued(data.message, chId, dmId);
            }

            activeAddMessage(data.message);
            scrollToBottom();
        })
        .listen('MessageEdited', async (data: { message: MessageData }) => {
            const update: Partial<MessageData> = {
                content: data.message.content,
                is_edited: true,
                edited_at: data.message.edited_at,
                is_encrypted: data.message.is_encrypted,
            };

            if (data.message.is_encrypted && e2eeStore.isReady) {
                try {
                    let senderDeviceId = data.message.sender_device_id ?? '';
                    if (!senderDeviceId) {
                        try {
                            const parsed = JSON.parse(data.message.content);
                            senderDeviceId = parsed.sender_device_id ?? '';
                        } catch {
                            /* not valid JSON */
                        }
                    }
                    const channelIdForDecrypt = props.isDm ? undefined : props.channel?.id;
                    let plaintext: string;
                    try {
                        plaintext = await e2ee.decrypt(
                            data.message.content,
                            data.message.user.id,
                            senderDeviceId,
                            channelIdForDecrypt,
                            data.message.id,
                        );
                    } catch (firstErr) {
                        const errMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
                        if (errMsg.includes('Need sender key distribution') && channelIdForDecrypt != null) {
                            await e2ee.fetchAndProcessSenderKeys(channelIdForDecrypt);
                            plaintext = await e2ee.decrypt(
                                data.message.content,
                                data.message.user.id,
                                senderDeviceId,
                                channelIdForDecrypt,
                                data.message.id,
                            );
                        } else {
                            throw firstErr;
                        }
                    }
                    update.decrypted_content = plaintext;
                    update.decrypt_error = false;
                } catch (decryptErr) {
                    const errMsg = decryptErr instanceof Error ? decryptErr.message : String(decryptErr);
                    if (errMsg.includes('Need sender key distribution')) {
                        // Sender key not available yet — don't mark as permanently failed
                    } else {
                        update.decrypt_error = true;
                    }
                }
            }

            activeUpdateMessage(data.message.id, update);
        })
        .listen('MessageDeleted', (data: { message_id: number }) => {
            activeRemoveMessage(data.message_id);
        })
        .listen('ReactionToggled', (data: { reaction: MessageReaction; added: boolean }) => {
            const msg = activeMessages.value.find((m) => m.id === data.reaction.message_id);
            if (msg) {
                if (!msg.reactions) msg.reactions = [];
                if (data.added) {
                    const exists = msg.reactions.some(
                        (r) => r.user_id === data.reaction.user_id && r.emoji === data.reaction.emoji,
                    );
                    if (!exists) {
                        msg.reactions.push(data.reaction);
                    }
                } else {
                    const idx = msg.reactions.findIndex(
                        (r) => r.user_id === data.reaction.user_id && r.emoji === data.reaction.emoji,
                    );
                    if (idx !== -1) {
                        msg.reactions.splice(idx, 1);
                    }
                }
            }
        })
        .listen('UserTyping', (data: { user_id: number; username: string; is_typing: boolean }) => {
            if (data.user_id === currentUser.value?.id) return;

            if (data.is_typing) {
                const existing = typingUsers.get(data.user_id);
                if (existing) clearTimeout(existing.timeout);

                const timeout = setTimeout(() => {
                    typingUsers.delete(data.user_id);
                }, 3000);

                typingUsers.set(data.user_id, {
                    username: data.username,
                    timeout,
                });
            } else {
                const existing = typingUsers.get(data.user_id);
                if (existing) clearTimeout(existing.timeout);
                typingUsers.delete(data.user_id);
            }
        })
        .listen('SenderKeyNeeded', async () => {
            if (e2eeStore.isReady) {
                try {
                    if (isDm) {
                        await e2ee.ensureDmSenderKeyDistributed(channelId, true);
                    } else {
                        await e2ee.ensureSenderKeyDistributed(channelId, true);
                    }
                } catch {
                    // Failed to redistribute sender key
                }
            }
        })
        .listen('SenderKeyDistributed', async () => {
            if (e2eeStore.isReady && props.channel?.id) {
                try {
                    if (isDm) {
                        await e2ee.fetchAndProcessDmSenderKeys(channelId);
                        await e2ee.retryPendingDecryptions(activeMessages.value, undefined, channelId);
                    } else {
                        await e2ee.fetchAndProcessSenderKeys(channelId);
                        await e2ee.retryPendingDecryptions(activeMessages.value, channelId);
                    }
                } catch {
                    // Failed to process redistributed sender keys
                }
            }
        })
        .listen('DmSenderKeyNeeded', async () => {
            if (isDm && e2eeStore.isReady) {
                try {
                    await e2ee.ensureDmSenderKeyDistributed(channelId, true);
                } catch {
                    // Failed to redistribute DM sender key
                }
            }
        })
        .listen('DmSenderKeyDistributed', async () => {
            if (isDm && e2eeStore.isReady && props.channel?.id) {
                try {
                    await e2ee.fetchAndProcessDmSenderKeys(channelId);
                    await e2ee.retryPendingDecryptions(activeMessages.value, undefined, channelId);
                } catch {
                    // Failed to process redistributed DM sender keys
                }
            }
        });
};

const leaveChannel = () => {
    clearPendingDecryptRetry();
    senderKeyFetchPromise = null;
    if (currentChannelListener) {
        const echo = getEcho();
        if (echo) {
            echo.leave(currentChannelListener);
        }
        currentChannelListener = null;
    }
    typingUsers.clear();
};

watch(
    () => props.channel?.id,
    (newId, oldId) => {
        if (newId) {
            joinChannel(newId, props.isDm);
            userIsNearBottom.value = true;

            if (oldId !== undefined) {
                scrollToBottom(true);
            }
        }
    },
    { immediate: true },
);

watch(isStoreLoadingMessages, async (loading, wasLoading) => {
    if (wasLoading && !loading) {
        if (e2eeStore.isReady && props.channel?.id) {
            if (senderKeyFetchPromise) {
                await senderKeyFetchPromise;
                senderKeyFetchPromise = null;
            }
            const channelIdForDecrypt = props.isDm ? undefined : props.channel.id;
            const dmGroupIdForDecrypt = props.isDm ? props.channel.id : undefined;
            await e2ee.decryptMessages(activeMessages.value, channelIdForDecrypt, dmGroupIdForDecrypt);

            clearPendingDecryptRetry();
            {
                let retryCount = 0;
                pendingDecryptRetryTimer = setInterval(async () => {
                    retryCount++;
                    const hasPending = activeMessages.value.some(
                        (m) => m.is_encrypted && m.decrypted_content === undefined && !m.decrypt_error,
                    );
                    if (!hasPending || retryCount > 10) {
                        clearPendingDecryptRetry();
                        return;
                    }
                    if (props.channel?.id) {
                        const chId = props.isDm ? undefined : props.channel.id;
                        const dmId = props.isDm ? props.channel.id : undefined;
                        await e2ee.retryPendingDecryptions(activeMessages.value, chId, dmId, true);
                    }
                }, 5_000);
            }
        }
        userIsNearBottom.value = true;
        scrollToBottom(true);
    }
});

watch(
    () => activeMessages.value.length,
    () => {
        if (!isLoadingMore.value && !isStoreLoadingMessages.value) {
            scrollToBottom();
        }
    },
);

onMounted(() => {
    document.addEventListener('click', handleClickOutside);
    scrollToBottom(true);
});

onUnmounted(() => {
    leaveChannel();
    cancelScrollRetry();
    clearPendingDecryptRetry();
    document.removeEventListener('click', handleClickOutside);
});

let loadCooldown = false;
const handleScroll = async () => {
    if (!messagesContainer.value) return;

    userIsNearBottom.value = checkIfNearBottom();

    if (isLoadingMore.value || loadCooldown) return;

    if (messagesContainer.value.scrollTop < 100) {
        isLoadingMore.value = true;
        const prevHeight = messagesContainer.value.scrollHeight;
        const prevScrollTop = messagesContainer.value.scrollTop;
        await activeLoadOlderMessages();

        if (e2eeStore.isReady) {
            const channelIdForDecrypt = props.isDm ? undefined : props.channel?.id;
            const dmGroupIdForDecrypt = props.isDm ? props.channel?.id : undefined;
            await e2ee.decryptMessages(activeMessages.value, channelIdForDecrypt, dmGroupIdForDecrypt);
        }

        await nextTick();
        if (messagesContainer.value) {
            const newHeight = messagesContainer.value.scrollHeight;
            messagesContainer.value.scrollTop = newHeight - prevHeight + prevScrollTop;
        }
        isLoadingMore.value = false;

        loadCooldown = true;
        setTimeout(() => {
            loadCooldown = false;
        }, 500);
    }
};

const sendMessage = async (content: string) => {
    if (!props.channel?.id) return;
    sendError.value = null;

    const mentionMeta = extractMentionMetadata(content);

    let messageContent = content;
    let isEncrypted = false;

    if (!e2eeStore.isReady) {
        sendError.value = 'Encryption is not set up. Please complete E2EE setup before sending messages.';
        return;
    }

    try {
        if (props.isDm) {
            messageContent = await e2ee.encryptForDM(props.channel.id, content);
            isEncrypted = true;
        } else {
            messageContent = await e2ee.encryptForChannel(props.channel.id, content);
            isEncrypted = true;
        }
    } catch {
        sendError.value = 'Failed to encrypt message. Please try again.';
        return;
    }

    const data: {
        content: string;
        reply_to_id?: number;
        is_encrypted?: boolean;
        sender_device_id?: string;
        mention_user_ids?: number[];
        mention_everyone?: boolean;
        mention_here?: boolean;
        search_tokens?: string[];
    } = {
        content: messageContent,
        is_encrypted: isEncrypted,
    };

    if (isEncrypted) {
        const senderDeviceId = await e2ee.getDeviceId();
        if (senderDeviceId) data.sender_device_id = senderDeviceId;
    }

    if (isEncrypted && props.channel?.id) {
        const tokens = await generateTokensForMessage(props.isDm ? 'dm' : 'channel', props.channel.id, content);
        if (tokens.length > 0) {
            data.search_tokens = tokens;
        }
    }

    if (isEncrypted) {
        if (mentionMeta.mentionEveryone) {
            data.mention_everyone = true;
        } else if (mentionMeta.mentionHere) {
            data.mention_here = true;
        } else if (mentionMeta.userIds.length > 0) {
            data.mention_user_ids = mentionMeta.userIds;
        }
    }

    if (replyingToMessage.value) {
        data.reply_to_id = replyingToMessage.value.id;
    }

    const endpoint = props.isDm
        ? `/direct-messages/${props.channel.id}/messages`
        : `/channels/${props.channel.id}/messages`;

    const optimisticMessage: MessageData = {
        id: Date.now(),
        content,
        is_edited: false,
        edited_at: null,
        deleted_at: null,
        reply_to_id: replyingToMessage.value?.id || null,
        reply_to: replyingToMessage.value || null,
        user: {
            id: currentUser.value!.id,
            username: (currentUser.value as any)?.username ?? currentUser.value!.name,
            avatar_path: null,
        },
        reactions: [],
        created_at: new Date().toISOString(),
        is_encrypted: isEncrypted,
        decrypted_content: content,
    };

    activeAddMessage(optimisticMessage);
    scrollToBottom(true);
    replyingToMessage.value = null;

    try {
        const response = await api.post(endpoint, data);

        if (response.data) {
            const serverMsg = response.data as MessageData;
            if (serverMsg.is_encrypted) {
                serverMsg.decrypted_content = content;
            }
            const idx = activeMessages.value.findIndex((m) => m.id === optimisticMessage.id);
            if (idx !== -1) {
                activeMessages.value.splice(idx, 1, serverMsg);
            }
        }
    } catch {
        activeRemoveMessage(optimisticMessage.id);
    }
};

const startReply = (message: MessageData) => {
    replyingToMessage.value = message;
};

const startEdit = (message: MessageData) => {
    editingMessageId.value = message.id;
    editContent.value = message.is_encrypted ? (message.decrypted_content ?? message.content) : message.content;
};

const cancelEdit = () => {
    editingMessageId.value = null;
    editContent.value = '';
};

const saveEdit = async (message: MessageData) => {
    if (!editContent.value.trim() || !props.channel?.id) return;

    const endpoint = props.isDm
        ? `/direct-messages/${props.channel.id}/messages/${message.id}`
        : `/channels/${props.channel.id}/messages/${message.id}`;

    try {
        let contentToSend = editContent.value;
        let isEncrypted = false;

        if (e2eeStore.isReady) {
            try {
                if (props.isDm) {
                    contentToSend = await e2ee.encryptForDM(props.channel.id, editContent.value);
                    isEncrypted = true;
                } else {
                    contentToSend = await e2ee.encryptForChannel(props.channel.id, editContent.value);
                    isEncrypted = true;
                }
            } catch {
                return;
            }
        }

        await api.put(endpoint, {
            content: contentToSend,
            is_encrypted: isEncrypted,
            ...(isEncrypted && { sender_device_id: await e2ee.getDeviceId() }),
            ...(isEncrypted &&
                props.channel?.id && {
                    search_tokens: await generateTokensForMessage(
                        props.isDm ? 'dm' : 'channel',
                        props.channel.id,
                        editContent.value,
                    ),
                }),
        });
        activeUpdateMessage(message.id, {
            content: contentToSend,
            is_edited: true,
            edited_at: new Date().toISOString(),
            is_encrypted: isEncrypted,
            decrypted_content: isEncrypted ? editContent.value : undefined,
        });
        cancelEdit();
    } catch (error) {
        console.error('Failed to edit message:', error);
    }
};

const deleteMessage = async (message: MessageData) => {
    if (!props.channel?.id) return;

    const endpoint = props.isDm
        ? `/direct-messages/${props.channel.id}/messages/${message.id}`
        : `/channels/${props.channel.id}/messages/${message.id}`;

    try {
        await api.delete(endpoint);
        activeRemoveMessage(message.id);
    } catch (error) {
        console.error('Failed to delete message:', error);
    }
};

const toggleReaction = async (message: MessageData, emoji: string) => {
    if (!props.channel?.id) return;
    emojiPickerMessageId.value = null;

    const endpoint = props.isDm
        ? `/direct-messages/${props.channel.id}/messages/${message.id}/reactions`
        : `/channels/${props.channel.id}/messages/${message.id}/reactions`;

    try {
        const response = await api.post(endpoint, { emoji });
        const data = response.data as { added: boolean };

        if (!message.reactions) message.reactions = [];
        if (data.added) {
            message.reactions.push({
                id: 0,
                message_id: message.id,
                user_id: currentUser.value!.id,
                emoji,
            });
        } else {
            const idx = message.reactions.findIndex((r) => r.user_id === currentUser.value!.id && r.emoji === emoji);
            if (idx !== -1) {
                message.reactions.splice(idx, 1);
            }
        }
    } catch (error) {
        console.error('Failed to toggle reaction:', error);
    }
};

const emitTyping = () => {
    if (!props.channel?.id) return;
    if (typingDebounceTimer) return;

    const endpoint = props.isDm
        ? `/direct-messages/${props.channel.id}/typing`
        : `/channels/${props.channel.id}/typing`;

    api.post(endpoint).catch(() => {});

    typingDebounceTimer = setTimeout(() => {
        typingDebounceTimer = null;
    }, 2000);
};
</script>

<template>
    <div class="bg-background relative flex h-full min-h-0 flex-1 flex-col">
        <div class="border-border flex h-12 items-center border-b px-4 shadow-sm">
            <Hash v-if="!isDm" :size="20" class="text-muted-foreground mr-2" />
            <MessageSquare v-else :size="20" class="text-muted-foreground mr-2" />
            <div class="flex-1">
                <h2 class="flex items-center gap-1.5 font-semibold">
                    {{ channel?.name || 'Select a channel' }}
                    <EncryptionBadge v-if="e2eeStore.isReady" :is-encrypted="true" />
                </h2>
                <p v-if="channel?.topic" class="text-muted-foreground text-xs">
                    {{ channel.topic }}
                </p>
            </div>

            <div class="ml-4 flex items-center gap-2">
                <button
                    v-if="e2eeStore.isReady"
                    class="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1 transition-colors"
                    :class="{ 'bg-muted text-foreground': showSearch }"
                    title="Search messages"
                    @click="showSearch = !showSearch"
                >
                    <Search :size="18" />
                </button>
                <button
                    v-if="isDm && e2eeStore.isReady && channel?.other_user"
                    class="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1 transition-colors"
                    title="Verify safety number"
                    @click="showSafetyNumber = true"
                >
                    <ShieldCheck :size="18" />
                </button>
                <NotificationBell />
            </div>
        </div>

        <div
            ref="messagesContainer"
            class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
            @scroll="handleScroll"
        >
            <div v-if="activeMessages.length === 0" class="flex h-full items-center justify-center">
                <div class="text-muted-foreground text-center">
                    <MessageSquare v-if="isDm" :size="48" class="mx-auto mb-2 opacity-50" />
                    <Hash v-else :size="48" class="mx-auto mb-2 opacity-50" />
                    <p class="text-lg font-semibold">
                        {{ isDm ? `Conversation with ${channel?.name}` : `Welcome to #${channel?.name}` }}
                    </p>
                    <p class="text-sm">This is the start of your conversation.</p>
                </div>
            </div>

            <div v-else class="space-y-1">
                <div v-if="isLoadingMore" class="flex justify-center py-2">
                    <div class="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"></div>
                </div>

                <Message
                    v-for="message in activeMessages"
                    :key="message.id"
                    :message="message"
                    :is-editing="editingMessageId === message.id"
                    :edit-content="editContent"
                    :show-emoji-picker="emojiPickerMessageId === message.id"
                    :can-manage-messages="channelPermissions?.canManageMessages ?? false"
                    :can-add-reactions="channelPermissions?.canAddReactions ?? true"
                    :can-send-messages="channelPermissions?.canSendMessages ?? true"
                    @start-edit="startEdit(message)"
                    @cancel-edit="cancelEdit"
                    @save-edit="saveEdit(message)"
                    @delete="deleteMessage(message)"
                    @reply="startReply(message)"
                    @toggle-reaction="(emoji) => toggleReaction(message, emoji)"
                    @toggle-emoji-picker="
                        emojiPickerMessageId = emojiPickerMessageId === message.id ? null : message.id
                    "
                    @update-edit-content="editContent = $event"
                />
            </div>
            <div ref="bottomSentinel" class="h-0 w-0" />
        </div>

        <TypingIndicator :typing-users="typingUsers" />

        <!-- Send error banner -->
        <div
            v-if="sendError"
            class="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 border-t px-4 py-2 text-sm"
        >
            <span class="flex-1">{{ sendError }}</span>
            <button class="hover:bg-destructive/20 shrink-0 rounded px-2 py-0.5 text-xs" @click="sendError = null">
                Dismiss
            </button>
        </div>

        <MessageInput
            v-if="isDm || channelPermissions?.canSendMessages !== false"
            :channel-name="channel?.name"
            :replying-to="replyingToMessage"
            @send="sendMessage"
            @typing="emitTyping"
            @cancel-reply="replyingToMessage = null"
        />
        <div v-else class="border-border bg-muted/50 text-muted-foreground border-t px-4 py-3 text-center text-sm">
            You do not have permission to send messages in this channel.
        </div>

        <SafetyNumberDialog
            v-if="showSafetyNumber && channel?.other_user"
            :open="showSafetyNumber"
            :user-id="channel.other_user.id"
            :username="channel.other_user.username"
            @close="showSafetyNumber = false"
        />

        <SearchMessages
            v-if="showSearch && channel"
            :conversation-type="isDm ? 'dm' : 'channel'"
            :conversation-id="channel.id"
            :conversation-name="isDm ? (channel.name ?? '') : `#${channel.name}`"
            @close="showSearch = false"
            @navigate-to-message="
                (id) => {
                    /* TODO: scroll to message */
                }
            "
        />
    </div>
</template>
