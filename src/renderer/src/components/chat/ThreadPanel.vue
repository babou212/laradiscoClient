<script setup lang="ts">
import { BellOff, BellRing, MessageSquareText, X } from 'lucide-vue-next';
import { computed, nextTick, onMounted, onUnmounted, reactive, shallowRef, useTemplateRef, watch } from 'vue';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useE2EE } from '@/composables/useE2EE';
import { coerceBroadcastMessage } from '@/api/normalizers';
import { toggleThreadReaction, followThread as apiFollowThread, unfollowThread as apiUnfollowThread } from '@/api/threads';
import { sendThreadTyping } from '@/api/typing';
import { getEcho } from '@/lib/echo';
import { renderMarkdownWithMentions } from '@/lib/markdown';
import { formatMessageDate } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useAvatarStore } from '@/stores/avatar';
import { useE2eeStore } from '@/stores/e2ee';
import { usePresenceStore } from '@/stores/presence';
import { useThreadStore } from '@/stores/thread';
import type { MessageData, MessageReaction, ChannelPermissions } from '@/types/chat';
import Message from './Message.vue';
import MessageInput from './MessageInput.vue';
import TypingIndicator from './TypingIndicator.vue';

interface Props {
    channelId: string;
    channelPermissions?: ChannelPermissions;
}

const props = defineProps<Props>();
const emit = defineEmits<{ close: [] }>();

const authStore = useAuthStore();
const avatarStore = useAvatarStore();
const e2eeStore = useE2eeStore();
const presenceStore = usePresenceStore();
const threadStore = useThreadStore();
const e2ee = useE2EE();

const currentUser = computed(() => authStore.user);
const messagesContainer = useTemplateRef<HTMLElement>('messagesContainer');
const editingMessageId = shallowRef<string | null>(null);
const editContent = shallowRef('');
const emojiPickerMessageId = shallowRef<string | null>(null);
const sendError = shallowRef<string | null>(null);
const userIsNearBottom = shallowRef(true);
const isLoadingMore = shallowRef(false);
const typingUsers = reactive(new Map<number, { username: string; timeout: ReturnType<typeof setTimeout> }>());
let typingDebounceTimer: ReturnType<typeof setTimeout> | null = null;

let currentThreadListener: string | null = null;

const parentDisplayContent = computed(() => {
    const msg = threadStore.parentMessage;
    if (!msg) return '';
    if (msg.decrypt_error) return '[Unable to decrypt this message]';
    return msg.decrypted_content ?? '';
});

const parentRendered = computed(() => renderMarkdownWithMentions(parentDisplayContent.value));

const isParentDecrypting = computed(() => {
    const msg = threadStore.parentMessage;
    if (!msg) return false;
    return !msg.decrypt_error && !msg.decrypted_content;
});

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
        if (member) userIds.push(Number(member.id));
    }
    return { userIds: [...new Set(userIds)], mentionEveryone, mentionHere };
}

const joinThread = (threadId: number | string) => {
    leaveThread();
    const echo = getEcho();
    if (!echo) return;

    currentThreadListener = `thread.${threadId}`;

    echo.join(currentThreadListener)
        .listen('ThreadMessageSent', async (data: { message: MessageData }) => {
            coerceBroadcastMessage(data.message);
            if (data.message.user.id === currentUser.value?.id) {
                const ourDeviceId = e2eeStore.isReady ? await e2ee.getDeviceId() : null;
                const msgDeviceId = data.message.sender_device_id ?? '';
                if (!msgDeviceId || !ourDeviceId || msgDeviceId === ourDeviceId) return;
            }

            if (e2eeStore.isReady) {
                await e2ee.decryptMessageQueued(data.message, props.channelId, undefined);
            }

            threadStore.addThreadMessage(data.message);
            scrollToBottom();
        })
        .listen('ThreadMessageEdited', async (data: { message: MessageData }) => {
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
                        const plaintext = await e2ee.decrypt(
                            data.message.content,
                            Number(props.channelId),
                            undefined,
                            Number(data.message.id),
                        );
                        update.decrypted_content = plaintext.text;
                        update.decrypted_attachments = plaintext.attachments;
                        update.decrypt_error = false;
                    } catch {
                        update.decrypt_error = true;
                    }
                }
            }

            threadStore.updateThreadMessage(data.message.id, update);
        })
        .listen('ThreadMessageDeleted', (data: { message_id: number | string }) => {
            threadStore.removeThreadMessage(String(data.message_id));
        })
        .listen('UserTyping', (data: { user_id: number; username: string; is_typing: boolean }) => {
            if (String(data.user_id) === currentUser.value?.id) return;

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
        .listen('ReactionToggled', (data: { reaction: MessageReaction; added: boolean }) => {
            data.reaction.id = String(data.reaction.id);
            data.reaction.message_id = String(data.reaction.message_id);
            data.reaction.user_id = String(data.reaction.user_id);
            const msg = threadStore.threadMessages.find((m) => m.id === data.reaction.message_id);
            if (msg) {
                if (!msg.reactions) msg.reactions = [];
                if (data.added) {
                    const exists = msg.reactions.some(
                        (r) => r.user_id === data.reaction.user_id && r.emoji === data.reaction.emoji,
                    );
                    if (!exists) msg.reactions.push(data.reaction);
                } else {
                    const idx = msg.reactions.findIndex(
                        (r) => r.user_id === data.reaction.user_id && r.emoji === data.reaction.emoji,
                    );
                    if (idx !== -1) msg.reactions.splice(idx, 1);
                }
            }
        });
};

const leaveThread = () => {
    if (currentThreadListener) {
        const echo = getEcho();
        if (echo) echo.leave(currentThreadListener);
        currentThreadListener = null;
    }
    typingUsers.clear();
};

const emitTyping = () => {
    const thread = threadStore.activeThread;
    if (!thread) return;
    if (typingDebounceTimer) return;

    sendThreadTyping(props.channelId, thread.id).catch(() => {});

    typingDebounceTimer = setTimeout(() => {
        typingDebounceTimer = null;
    }, 2000);
};

const scrollToBottom = (force = false) => {
    nextTick(() => {
        if (!messagesContainer.value) return;
        if (!force && !userIsNearBottom.value) return;
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    });
};

const checkIfNearBottom = () => {
    if (!messagesContainer.value) return true;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainer.value;
    return scrollHeight - scrollTop - clientHeight < 150;
};

const handleScroll = async () => {
    if (!messagesContainer.value) return;
    userIsNearBottom.value = checkIfNearBottom();

    if (isLoadingMore.value) return;
    if (messagesContainer.value.scrollTop < 100 && threadStore.prevCursor) {
        isLoadingMore.value = true;
        const prevHeight = messagesContainer.value.scrollHeight;
        const prevScrollTop = messagesContainer.value.scrollTop;
        await threadStore.loadOlderMessages(props.channelId);

        if (e2eeStore.isReady) {
            await e2ee.decryptMessages(threadStore.threadMessages, Number(props.channelId), undefined);
        }

        await nextTick();
        if (messagesContainer.value) {
            const newHeight = messagesContainer.value.scrollHeight;
            messagesContainer.value.scrollTop = newHeight - prevHeight + prevScrollTop;
        }
        isLoadingMore.value = false;
    }
};

watch(
    () => threadStore.activeThread?.id,
    async (threadId, oldThreadId) => {
        if (oldThreadId) leaveThread();
        if (threadId) {
            joinThread(threadId);
        }
    },
    { immediate: true },
);

watch(
    () => threadStore.isLoadingMessages,
    async (loading, wasLoading) => {
        if (wasLoading && !loading) {
            if (e2eeStore.isReady) {
                await e2ee.decryptMessages(threadStore.threadMessages, Number(props.channelId), undefined);
            }
            scrollToBottom(true);
        }
    },
);

watch(
    () => threadStore.threadMessages.length,
    () => {
        if (!isLoadingMore.value && !threadStore.isLoadingMessages) {
            scrollToBottom();
        }
    },
);

onMounted(() => scrollToBottom(true));

onUnmounted(() => {
    leaveThread();
});

const sendReply = async (content: string) => {
    if (!threadStore.parentMessage) return;
    sendError.value = null;

    const mentionMeta = extractMentionMetadata(content);
    let messageContent = content;

    if (!e2eeStore.isReady) {
        sendError.value = 'Encryption is not set up.';
        return;
    }

    try {
        messageContent = await e2ee.encryptForChannel(Number(props.channelId), content);
    } catch {
        sendError.value = 'Failed to encrypt message.';
        return;
    }

    let historyCiphertext: string | undefined;
    try {
        historyCiphertext = await e2ee.encryptHistory(`channel:${props.channelId}`, content);
    } catch {
        // Best-effort
    }

    const extra: Record<string, any> = {};

    if (historyCiphertext) {
        extra.history_ciphertext = historyCiphertext;
    }

    {
        const senderDeviceId = await e2ee.getDeviceId();
        if (senderDeviceId) extra.sender_device_id = senderDeviceId;

        if (mentionMeta.mentionEveryone) extra.mention_everyone = true;
        else if (mentionMeta.mentionHere) extra.mention_here = true;
        else if (mentionMeta.userIds.length > 0) extra.mention_user_ids = mentionMeta.userIds;
    }

    const optimistic: MessageData = {
        id: String(Date.now()),
        content,
        is_edited: false,
        edited_at: null,
        deleted_at: null,
        reply_to_id: null,
        user: {
            id: currentUser.value!.id,
            username: (currentUser.value as any)?.username ?? currentUser.value!.name,
            avatar_urls: null,
        },
        reactions: [],
        created_at: new Date().toISOString(),
        decrypted_content: content,
    };

    threadStore.addThreadMessage(optimistic);
    scrollToBottom(true);

    const reply = await threadStore.sendReply(props.channelId, threadStore.parentMessage.id, messageContent, extra);

    if (reply) {
        reply.decrypted_content = content;
        e2ee.cacheDecryptedContent(Number(reply.id), content, {
            conversationType: 'channel',
            conversationId: Number(props.channelId),
            userName: (currentUser.value as any)?.username ?? currentUser.value!.name,
        }).catch(() => {});
        const idx = threadStore.threadMessages.findIndex((m) => m.id === optimistic.id);
        if (idx !== -1) threadStore.threadMessages.splice(idx, 1, reply);
    } else {
        threadStore.removeThreadMessage(optimistic.id);
        sendError.value = 'Failed to send reply.';
    }
};

const startEdit = (message: MessageData) => {
    editingMessageId.value = message.id;
    editContent.value = message.decrypted_content ?? message.content;
};

const cancelEdit = () => {
    editingMessageId.value = null;
    editContent.value = '';
};

const saveEdit = async (message: MessageData) => {
    if (!editContent.value.trim() || !threadStore.activeThread) return;
    try {
        if (!e2eeStore.isReady) return;

        const extra: Record<string, any> = {};
        const contentToSend = await e2ee.encryptForChannel(Number(props.channelId), editContent.value);
        extra.sender_device_id = await e2ee.getDeviceId();
        try {
            extra.history_ciphertext = await e2ee.encryptHistory(`channel:${props.channelId}`, editContent.value);
        } catch {
            // Best-effort
        }

        await threadStore.editMessage(props.channelId, threadStore.activeThread.id, message.id, contentToSend, extra);

        e2ee.cacheDecryptedContent(Number(message.id), editContent.value, {
            conversationType: 'channel',
            conversationId: Number(props.channelId),
            userName: (currentUser.value as any)?.username ?? currentUser.value!.name,
        }).catch(() => {});
        threadStore.updateThreadMessage(message.id, {
            decrypted_content: editContent.value,
        });
        cancelEdit();
    } catch (error) {
        console.error('Failed to edit thread message:', error);
    }
};

const deleteMessage = async (message: MessageData) => {
    if (!threadStore.activeThread) return;
    await threadStore.deleteMessage(props.channelId, threadStore.activeThread.id, message.id);
    e2ee.removeFromSearchIndex(Number(message.id)).catch(() => {});
};

const toggleReaction = async (message: MessageData, emoji: string) => {
    if (!threadStore.activeThread || !currentUser.value) return;
    emojiPickerMessageId.value = null;
    await threadStore.toggleReaction(
        props.channelId,
        threadStore.activeThread.id,
        message.id,
        emoji,
        currentUser.value.id,
    );
};

const toggleFollow = async () => {
    if (!threadStore.activeThread) return;
    if (threadStore.activeThread.is_following) {
        await threadStore.unfollowThread(props.channelId, threadStore.activeThread.id);
    } else {
        await threadStore.followThread(props.channelId, threadStore.activeThread.id);
    }
};

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

onMounted(() => document.addEventListener('click', handleClickOutside));
onUnmounted(() => document.removeEventListener('click', handleClickOutside));
</script>

<template>
    <div class="border-border bg-background flex h-full w-full flex-col border-l">
        <div class="border-border flex h-12 items-center justify-between border-b px-3 shadow-sm">
            <div class="flex items-center gap-2">
                <MessageSquareText :size="18" class="text-primary" />
                <span class="text-sm font-semibold">Thread</span>
            </div>
            <div class="flex items-center gap-1">
                <button
                    v-if="threadStore.activeThread"
                    class="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
                    :title="threadStore.activeThread.is_following ? 'Unfollow thread' : 'Follow thread'"
                    @click="toggleFollow"
                >
                    <BellRing v-if="threadStore.activeThread.is_following" :size="16" class="text-primary" />
                    <BellOff v-else :size="16" />
                </button>
                <button
                    class="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
                    @click="emit('close')"
                >
                    <X :size="16" />
                </button>
            </div>
        </div>

        <div v-if="threadStore.parentMessage" class="border-border border-b p-3">
            <div class="flex items-start gap-2">
                <Avatar class="size-8 shrink-0">
                    <AvatarImage
                        v-if="avatarStore.getAvatarUrl(threadStore.parentMessage.user.id, 'small')"
                        :src="avatarStore.getAvatarUrl(threadStore.parentMessage.user.id, 'small')!"
                        :alt="threadStore.parentMessage.user.username"
                    />
                    <AvatarFallback class="bg-primary text-primary-foreground text-xs font-semibold">
                        {{ threadStore.parentMessage.user.username[0].toUpperCase() }}
                    </AvatarFallback>
                </Avatar>
                <div class="min-w-0 flex-1">
                    <div class="flex items-baseline gap-1.5">
                        <span class="text-xs font-semibold">{{ threadStore.parentMessage.user.username }}</span>
                        <span class="text-muted-foreground text-[10px]">
                            {{ formatMessageDate(threadStore.parentMessage.created_at) }}
                        </span>
                    </div>
                    <div v-if="isParentDecrypting" class="mt-1 flex flex-col gap-1">
                        <Skeleton class="h-3 w-3/4" />
                        <Skeleton class="h-3 w-1/2" />
                    </div>
                    <div v-else class="prose-chat mt-0.5 text-xs wrap-break-word" v-html="parentRendered" />
                </div>
            </div>
            <div v-if="threadStore.activeThread" class="text-muted-foreground mt-2 text-[10px]">
                {{ threadStore.activeThread.message_count }}
                {{ threadStore.activeThread.message_count === 1 ? 'reply' : 'replies' }}
            </div>
        </div>

        <div
            ref="messagesContainer"
            class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
            @scroll="handleScroll"
        >
            <div v-if="threadStore.isLoadingMessages" class="flex items-center justify-center py-4">
                <div class="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
            </div>

            <div v-else-if="threadStore.threadMessages.length === 0" class="flex h-full items-center justify-center">
                <div class="text-muted-foreground text-center">
                    <MessageSquareText :size="32" class="mx-auto mb-1.5 opacity-50" />
                    <p class="text-xs">No replies yet. Start the conversation!</p>
                </div>
            </div>

            <div v-else class="space-y-1">
                <div v-if="isLoadingMore" class="flex justify-center py-2">
                    <div class="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
                </div>

                <Message
                    v-for="message in threadStore.threadMessages"
                    :key="message.id"
                    :message="message"
                    :is-editing="editingMessageId === message.id"
                    :edit-content="editContent"
                    :show-emoji-picker="emojiPickerMessageId === message.id"
                    :can-manage-messages="channelPermissions?.canManageMessages ?? false"
                    :can-pin-messages="false"
                    :can-add-reactions="channelPermissions?.canAddReactions ?? true"
                    :can-send-messages="channelPermissions?.canSendMessages ?? true"
                    :show-thread-button="false"
                    @start-edit="startEdit(message)"
                    @cancel-edit="cancelEdit"
                    @save-edit="saveEdit(message)"
                    @delete="deleteMessage(message)"
                    @reply="() => {}"
                    @toggle-pin="() => {}"
                    @toggle-reaction="(emoji) => toggleReaction(message, emoji)"
                    @toggle-emoji-picker="
                        emojiPickerMessageId = emojiPickerMessageId === message.id ? null : message.id
                    "
                    @update-edit-content="editContent = $event"
                />
            </div>
        </div>

        <div
            v-if="sendError"
            class="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 border-t px-3 py-1.5 text-xs"
        >
            <span class="flex-1">{{ sendError }}</span>
            <button class="hover:bg-destructive/20 shrink-0 rounded px-2 py-0.5 text-[10px]" @click="sendError = null">
                Dismiss
            </button>
        </div>

        <TypingIndicator :typing-users="typingUsers" />

        <MessageInput
            v-if="channelPermissions?.canSendMessages !== false"
            :channel-name="'thread'"
            :placeholder="'Reply in thread...'"
            @send="sendReply"
            @typing="emitTyping"
            @cancel-reply="() => {}"
        />
    </div>
</template>
