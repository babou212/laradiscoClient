<script setup lang="ts">
import { Hash, MessageSquare } from 'lucide-vue-next';
import {
    computed,
    nextTick,
    onMounted,
    onUnmounted,
    reactive,
    ref,
    watch,
} from 'vue';
import api from '@/lib/api';
import { getEcho } from '@/lib/echo';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import { useDirectMessagesStore } from '@/stores/directMessages';
import type { MessageData, MessageReaction, ChannelPermissions } from '@/types/chat';
import Message from './Message.vue';
import MessageInput from './MessageInput.vue';
import TypingIndicator from './TypingIndicator.vue';
import NotificationBell from '@/components/NotificationBell.vue';

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
const currentUser = computed(() => authStore.user);

const activeMessages = computed(() => props.isDm ? dmStore.messages : chatStore.messages);
const activeAddMessage = (msg: MessageData) => props.isDm ? dmStore.addMessage(msg) : chatStore.addMessage(msg);
const activeUpdateMessage = (id: number, partial: Partial<MessageData>) => props.isDm ? dmStore.updateMessage(id, partial) : chatStore.updateMessage(id, partial);
const activeRemoveMessage = (id: number) => props.isDm ? dmStore.removeMessage(id) : chatStore.removeMessage(id);
const activeLoadOlderMessages = () => props.isDm ? dmStore.loadOlderMessages() : chatStore.loadOlderMessages();

const messagesContainer = ref<HTMLElement>();
const bottomSentinel = ref<HTMLElement>();
const editingMessageId = ref<number | null>(null);
const editContent = ref('');
const emojiPickerMessageId = ref<number | null>(null);
const replyingToMessage = ref<MessageData | null>(null);
const isLoadingMore = ref(false);
const userIsNearBottom = ref(true);

const isStoreLoadingMessages = computed(() =>
    props.isDm ? dmStore.isLoadingMessages : chatStore.isLoadingMessages,
);

const typingUsers = reactive(
    new Map<
        number,
        { username: string; timeout: ReturnType<typeof setTimeout> }
    >(),
);
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

const joinChannel = (channelId: number, isDm: boolean = false) => {
    leaveChannel();
    const echo = getEcho();
    if (!echo) return;

    currentChannelListener = isDm
        ? `direct-message.${channelId}`
        : `channel.${channelId}`;

    echo.join(currentChannelListener)
        .listen('MessageSent', (data: { message: MessageData }) => {
            const senderId = data.message.user.id;
            const existingTyping = typingUsers.get(senderId);
            if (existingTyping) {
                clearTimeout(existingTyping.timeout);
                typingUsers.delete(senderId);
            }

            if (senderId === currentUser.value?.id) return;

            activeAddMessage(data.message);
            scrollToBottom();
        })
        .listen('MessageEdited', (data: { message: MessageData }) => {
            activeUpdateMessage(data.message.id, {
                content: data.message.content,
                is_edited: true,
                edited_at: data.message.edited_at,
            });
        })
        .listen('MessageDeleted', (data: { message_id: number }) => {
            activeRemoveMessage(data.message_id);
        })
        .listen(
            'ReactionToggled',
            (data: { reaction: MessageReaction; added: boolean }) => {
                const msg = activeMessages.value.find(
                    (m) => m.id === data.reaction.message_id,
                );
                if (msg) {
                    if (data.added) {
                        const exists = msg.reactions.some(
                            (r) =>
                                r.user_id === data.reaction.user_id &&
                                r.emoji === data.reaction.emoji,
                        );
                        if (!exists) {
                            msg.reactions.push(data.reaction);
                        }
                    } else {
                        const idx = msg.reactions.findIndex(
                            (r) =>
                                r.user_id === data.reaction.user_id &&
                                r.emoji === data.reaction.emoji,
                        );
                        if (idx !== -1) {
                            msg.reactions.splice(idx, 1);
                        }
                    }
                }
            },
        )
        .listen(
            'UserTyping',
            (data: {
                user_id: number;
                username: string;
                is_typing: boolean;
            }) => {
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
            },
        );
};

const leaveChannel = () => {
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

watch(isStoreLoadingMessages, (loading, wasLoading) => {
    if (wasLoading && !loading) {
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

        await nextTick();
        if (messagesContainer.value) {
            const newHeight = messagesContainer.value.scrollHeight;
            messagesContainer.value.scrollTop = newHeight - prevHeight + prevScrollTop;
        }
        isLoadingMore.value = false;

        loadCooldown = true;
        setTimeout(() => { loadCooldown = false; }, 500);
    }
};

const sendMessage = async (content: string) => {
    if (!props.channel?.id) return;

    const data: { content: string; reply_to_id?: number } = { content };
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
    };

    activeAddMessage(optimisticMessage);
    scrollToBottom(true);
    replyingToMessage.value = null;

    try {
        const response = await api.post(endpoint, data);

        if (response.data) {
            const idx = activeMessages.value.findIndex((m) => m.id === optimisticMessage.id);
            if (idx !== -1) {
                activeMessages.value.splice(idx, 1, response.data);
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
    editContent.value = message.content;
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
        await api.put(endpoint, { content: editContent.value });
        activeUpdateMessage(message.id, {
            content: editContent.value,
            is_edited: true,
            edited_at: new Date().toISOString(),
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

        if (data.added) {
            message.reactions.push({
                id: 0,
                message_id: message.id,
                user_id: currentUser.value!.id,
                emoji,
            });
        } else {
            const idx = message.reactions.findIndex(
                (r) =>
                    r.user_id === currentUser.value!.id && r.emoji === emoji,
            );
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
    <div class="flex h-full min-h-0 flex-1 flex-col bg-background">
        <div
            class="flex h-12 items-center border-b border-border px-4 shadow-sm"
        >
            <Hash v-if="!isDm" :size="20" class="mr-2 text-muted-foreground" />
            <MessageSquare
                v-else
                :size="20"
                class="mr-2 text-muted-foreground"
            />
            <div class="flex-1">
                <h2 class="font-semibold">
                    {{ channel?.name || 'Select a channel' }}
                </h2>
                <p v-if="channel?.topic" class="text-xs text-muted-foreground">
                    {{ channel.topic }}
                </p>
            </div>

            <div class="ml-4 flex items-center gap-2">
                <NotificationBell />
            </div>
        </div>

        <div
            ref="messagesContainer"
            class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
            @scroll="handleScroll"
        >
            <div
                v-if="activeMessages.length === 0"
                class="flex h-full items-center justify-center"
            >
                <div class="text-center text-muted-foreground">
                    <MessageSquare v-if="isDm" :size="48" class="mx-auto mb-2 opacity-50" />
                    <Hash v-else :size="48" class="mx-auto mb-2 opacity-50" />
                    <p class="text-lg font-semibold">
                        {{ isDm ? `Conversation with ${channel?.name}` : `Welcome to #${channel?.name}` }}
                    </p>
                    <p class="text-sm">
                        This is the start of your conversation.
                    </p>
                </div>
            </div>

            <div v-else class="space-y-1">
                <div
                    v-if="isLoadingMore"
                    class="flex justify-center py-2"
                >
                    <div
                        class="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"
                    ></div>
                </div>

                <Message
                    v-for="message in activeMessages"
                    :key="message.id"
                    :message="message"
                    :is-editing="editingMessageId === message.id"
                    :edit-content="editContent"
                    :show-emoji-picker="
                        emojiPickerMessageId === message.id
                    "
                    :can-manage-messages="
                        channelPermissions?.canManageMessages ?? false
                    "
                    :can-add-reactions="
                        channelPermissions?.canAddReactions ?? true
                    "
                    :can-send-messages="
                        channelPermissions?.canSendMessages ?? true
                    "
                    @start-edit="startEdit(message)"
                    @cancel-edit="cancelEdit"
                    @save-edit="saveEdit(message)"
                    @delete="deleteMessage(message)"
                    @reply="startReply(message)"
                    @toggle-reaction="
                        (emoji) => toggleReaction(message, emoji)
                    "
                    @toggle-emoji-picker="
                        emojiPickerMessageId =
                            emojiPickerMessageId === message.id
                                ? null
                                : message.id
                    "
                    @update-edit-content="editContent = $event"
                />
            </div>
            <div ref="bottomSentinel" class="h-0 w-0" />
        </div>

        <TypingIndicator :typing-users="typingUsers" />

        <MessageInput
            v-if="isDm || channelPermissions?.canSendMessages !== false"
            :channel-name="channel?.name"
            :replying-to="replyingToMessage"
            @send="sendMessage"
            @typing="emitTyping"
            @cancel-reply="replyingToMessage = null"
        />
        <div
            v-else
            class="border-t border-border bg-muted/50 px-4 py-3 text-center text-sm text-muted-foreground"
        >
            You do not have permission to send messages in this channel.
        </div>
    </div>
</template>
