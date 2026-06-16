<script setup lang="ts">
import { BellOff, BellRing, MessageSquareText, X } from 'lucide-vue-next';
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, shallowRef, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import FileAttachment from './FileAttachment.vue';
import Message from './Message.vue';
import MessageInput from './MessageInput.vue';
import NewMessagePill from './NewMessagePill.vue';
import TypingIndicator from './TypingIndicator.vue';
import { coerceBroadcastMessage } from '@/api/normalizers';
import { sendThreadTyping } from '@/api/typing';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { useChatScroll } from '@/composables/useChatScroll';
import { getEcho } from '@/lib/echo';
import { renderMarkdownWithMentions } from '@/lib/markdown';
import { formatMessageDate } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { usePresenceStore } from '@/stores/presence';
import { useThreadStore } from '@/stores/thread';
import { useUsersStore } from '@/stores/users';
import type { MessageData, MessageReaction, ChannelPermissions } from '@/types/chat';

interface Props {
    channelId: string;
    channelPermissions?: ChannelPermissions;
}

const props = defineProps<Props>();
const emit = defineEmits<{ close: [] }>();

const authStore = useAuthStore();
const usersStore = useUsersStore();
const presenceStore = usePresenceStore();
const threadStore = useThreadStore();
const { t } = useI18n();

const currentUser = computed(() => authStore.user);
const messagesContainer = useTemplateRef<HTMLElement>('messagesContainer');
const messagesContent = useTemplateRef<HTMLElement>('messagesContent');
const editingMessageId = shallowRef<string | null>(null);
const editContent = shallowRef('');
const emojiPickerMessageId = shallowRef<string | null>(null);
const sendError = shallowRef<string | null>(null);
const typingUsers = reactive(new Map<number, { username: string; timeout: ReturnType<typeof setTimeout> }>());
let typingDebounceTimer: ReturnType<typeof setTimeout> | null = null;

let currentThreadListener: string | null = null;

const parentDisplayContent = computed(() => threadStore.parentMessage?.content ?? '');

const parentRendered = computed(() => renderMarkdownWithMentions(parentDisplayContent.value));

const isParentGifUrl = computed(() => {
    const content = parentDisplayContent.value;
    return (
        !!content.match(/^https?:\/\/.*\.gif$/i) || content.includes('tenor.com') || content.includes('media.tenor.com')
    );
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
        .listen('ThreadMessageSent', (data: { message: MessageData }) => {
            coerceBroadcastMessage(data.message);
            if (threadStore.threadMessages.some((m) => m.id === data.message.id)) return;
            // While viewing an older window, don't splice in a non-contiguous
            // message — surface it via the pill; it loads on return to live.
            if (threadStore.isViewingHistory) {
                notifyNewMessage();
                return;
            }
            threadStore.addThreadMessage(data.message);
            notifyNewMessage();
        })
        .listen('ThreadMessageEdited', (data: { message: MessageData }) => {
            coerceBroadcastMessage(data.message);
            threadStore.updateThreadMessage(data.message.id, {
                content: data.message.content,
                is_edited: true,
                edited_at: data.message.edited_at,
            });
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
                        (r) => String(r.user_id) === data.reaction.user_id && r.emoji === data.reaction.emoji,
                    );
                    if (!exists) msg.reactions.push(data.reaction);
                } else {
                    const idx = msg.reactions.findIndex(
                        (r) => String(r.user_id) === data.reaction.user_id && r.emoji === data.reaction.emoji,
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

const canLoadOlder = computed(() => threadStore.hasMoreBefore);
const canLoadNewer = computed(() => threadStore.hasMoreAfter);
const isViewingHistoryThread = computed(() => threadStore.isViewingHistory);

const { pinnedToBottom, unreadNewCount, isLoadingOlder, jumpToBottom, notifyNewMessage, resetForNewConversation } =
    useChatScroll({
        containerRef: messagesContainer,
        contentRef: messagesContent,
        canLoadOlder,
        canLoadNewer,
        isViewingHistory: isViewingHistoryThread,
        onLoadOlder: () => threadStore.loadOlderMessages(),
        onLoadNewer: () => threadStore.loadNewerMessages(),
        onLoadAround: (messageId: string) => threadStore.loadMessagesAround(messageId),
        onResetToLive: () => threadStore.resetToLive(),
    });

function resetThreadScroll(): void {
    resetForNewConversation();
}

const showPillForHistory = computed(() => threadStore.isViewingHistory);
const showPill = computed(() => !pinnedToBottom.value || showPillForHistory.value);

const emitTyping = () => {
    const thread = threadStore.activeThread;
    if (!thread) return;
    if (typingDebounceTimer) return;

    sendThreadTyping(props.channelId, thread.id).catch(() => {});

    typingDebounceTimer = setTimeout(() => {
        typingDebounceTimer = null;
    }, 2000);
};

watch(
    () => threadStore.activeThread?.id,
    (threadId, oldThreadId) => {
        if (oldThreadId) leaveThread();
        if (threadId) {
            joinThread(threadId);
        }
    },
    { immediate: true },
);

watch(
    () => threadStore.isLoadingMessages,
    (loading, wasLoading) => {
        if (wasLoading && !loading) {
            resetThreadScroll();
        }
    },
);

onMounted(() => resetThreadScroll());

onUnmounted(() => {
    leaveThread();
});

const sendReply = async (content: string) => {
    if (!threadStore.parentMessage) return;
    sendError.value = null;

    const mentionMeta = extractMentionMetadata(content);

    const extra: {
        mention_user_ids?: number[];
        mention_everyone?: boolean;
        mention_here?: boolean;
    } = {};

    if (mentionMeta.mentionEveryone) extra.mention_everyone = true;
    else if (mentionMeta.mentionHere) extra.mention_here = true;
    else if (mentionMeta.userIds.length > 0) extra.mention_user_ids = mentionMeta.userIds;

    const optimistic: MessageData = {
        id: String(Date.now()),
        content,
        is_edited: false,
        edited_at: null,
        deleted_at: null,
        reply_to_id: null,
        user: {
            id: currentUser.value!.id,
            username: currentUser.value!.username,
            avatar_urls: null,
        },
        reactions: [],
        created_at: new Date().toISOString(),
    };

    // Snap back to the live tail if viewing history, so the reply lands
    // contiguously rather than after a gap.
    if (threadStore.isViewingHistory) {
        await threadStore.resetToLive();
        await nextTick();
    }

    threadStore.addThreadMessage(optimistic);
    resetThreadScroll();

    const reply = await threadStore.sendReply(props.channelId, threadStore.parentMessage.id, content, extra);

    if (reply) {
        const idx = threadStore.threadMessages.findIndex((m) => m.id === optimistic.id);
        if (idx !== -1) threadStore.threadMessages.splice(idx, 1, reply);
    } else {
        threadStore.removeThreadMessage(optimistic.id);
        sendError.value = t('chat.thread.failedToSendReply');
    }
};

const startEdit = (message: MessageData) => {
    editingMessageId.value = message.id;
    editContent.value = message.content ?? '';
};

const cancelEdit = () => {
    editingMessageId.value = null;
    editContent.value = '';
};

const saveEdit = async (message: MessageData) => {
    if (!editContent.value.trim() || !threadStore.activeThread) return;
    try {
        await threadStore.editMessage(props.channelId, threadStore.activeThread.id, message.id, editContent.value);
        threadStore.updateThreadMessage(message.id, { content: editContent.value });
        cancelEdit();
    } catch (error) {
        console.error('Failed to edit thread message:', error);
    }
};

const showDeleteDialog = ref(false);
const pendingDeleteMessage = shallowRef<MessageData | null>(null);

const deleteMessage = (message: MessageData) => {
    pendingDeleteMessage.value = message;
    showDeleteDialog.value = true;
};

const confirmDeleteMessage = async () => {
    const message = pendingDeleteMessage.value;
    if (!message || !threadStore.activeThread) return;

    try {
        await threadStore.deleteMessage(props.channelId, threadStore.activeThread.id, message.id);
    } finally {
        showDeleteDialog.value = false;
        pendingDeleteMessage.value = null;
    }
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
                <span class="text-sm font-semibold">{{ t('chat.thread.title') }}</span>
            </div>
            <div class="flex items-center gap-1">
                <SimpleTooltip
                    v-if="threadStore.activeThread"
                    :content="
                        threadStore.activeThread.is_following
                            ? t('chat.thread.unfollowTooltip')
                            : t('chat.thread.followTooltip')
                    "
                >
                    <button
                        class="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
                        @click="toggleFollow"
                    >
                        <BellRing v-if="threadStore.activeThread.is_following" :size="16" class="text-primary" />
                        <BellOff v-else :size="16" />
                    </button>
                </SimpleTooltip>
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
                        v-if="usersStore.avatarUrl(threadStore.parentMessage.user.id, 'small')"
                        :src="usersStore.avatarUrl(threadStore.parentMessage.user.id, 'small')!"
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
                    <div v-if="isParentGifUrl" class="mt-1 w-fit overflow-hidden rounded-lg" style="min-height: 80px">
                        <img :src="parentDisplayContent" alt="GIF" class="h-auto max-w-xs" loading="lazy" />
                    </div>
                    <div v-else class="prose-chat mt-0.5 text-xs wrap-break-word" v-html="parentRendered" />
                    <div v-if="threadStore.parentMessage.attachments?.length" class="mt-1.5 flex flex-wrap gap-2">
                        <FileAttachment
                            v-for="att in threadStore.parentMessage.attachments"
                            :key="att.id"
                            :attachment="att"
                        />
                    </div>
                </div>
            </div>
            <div v-if="threadStore.activeThread" class="text-muted-foreground mt-2 text-[10px]">
                {{
                    t(
                        'chat.thread.replyCount',
                        { count: threadStore.activeThread.message_count },
                        threadStore.activeThread.message_count,
                    )
                }}
            </div>
        </div>

        <div class="relative min-h-0 flex-1">
            <div
                ref="messagesContainer"
                class="h-full overflow-y-auto overscroll-contain p-3"
                style="overflow-anchor: none"
            >
                <div ref="messagesContent">
                    <div v-if="threadStore.isLoadingMessages" class="flex items-center justify-center py-4">
                        <div class="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
                    </div>

                    <div
                        v-else-if="threadStore.threadMessages.length === 0"
                        class="flex h-full items-center justify-center"
                    >
                        <div class="text-muted-foreground text-center">
                            <MessageSquareText :size="32" class="mx-auto mb-1.5 opacity-50" />
                            <p class="text-xs">{{ t('chat.thread.noReplies') }}</p>
                        </div>
                    </div>

                    <div v-else class="space-y-1">
                        <div v-if="isLoadingOlder" class="flex justify-center py-2">
                            <div
                                class="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
                            />
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
            </div>

            <div v-if="showPill" class="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
                <NewMessagePill :count="unreadNewCount" :viewing-history="showPillForHistory" @click="jumpToBottom" />
            </div>
        </div>

        <div
            v-if="sendError"
            class="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 border-t px-3 py-1.5 text-xs"
        >
            <span class="flex-1">{{ sendError }}</span>
            <button class="hover:bg-destructive/20 shrink-0 rounded px-2 py-0.5 text-[10px]" @click="sendError = null">
                {{ t('chat.common.dismiss') }}
            </button>
        </div>

        <TypingIndicator :typing-users="typingUsers" />

        <MessageInput
            v-if="channelPermissions?.canSendMessages !== false"
            :channel-name="'thread'"
            :placeholder="t('chat.thread.replyPlaceholder')"
            @send="sendReply"
            @typing="emitTyping"
            @cancel-reply="() => {}"
        />

        <Dialog v-model:open="showDeleteDialog">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{{ t('chat.thread.deleteDialogTitle') }}</DialogTitle>
                    <DialogDescription>
                        {{ t('chat.thread.deleteDialogDescription') }}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" @click="showDeleteDialog = false">
                        {{ t('chat.thread.cancel') }}
                    </Button>
                    <Button variant="destructive" @click="confirmDeleteMessage">
                        {{ t('chat.thread.deleteConfirm') }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
