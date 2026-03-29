<script setup lang="ts">
import { Hash, MessageSquare, PanelRightClose, PanelRightOpen, Pin, Search } from 'lucide-vue-next';
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import Message from './Message.vue';
import MessageInput from './MessageInput.vue';
import PinnedMessagesPanel from './PinnedMessagesPanel.vue';
import SearchMessages from './SearchMessages.vue';
import TypingIndicator from './TypingIndicator.vue';
import NotificationBell from '@/components/NotificationBell.vue';
import { useActiveStore } from '@/composables/useActiveStore';
import { useChannelRealtime } from '@/composables/useChannelRealtime';
import { useE2EE } from '@/composables/useE2EE';
import { usePinnedMessages } from '@/composables/usePinnedMessages';
import { useRateLimit } from '@/composables/useRateLimit';
import { useScrollManager } from '@/composables/useScrollManager';
import { useTypingIndicator } from '@/composables/useTypingIndicator';
import api from '@/lib/api';
import { UploadingFileSchema } from '@/lib/message-schemas';
import type { UploadingFile } from '@/lib/message-schemas';
import type { StagedFile } from '@/lib/message-schemas';
import { useAuthStore } from '@/stores/auth';
import { useE2eeStore } from '@/stores/e2ee';
import { useThreadStore } from '@/stores/thread';
import type { AvatarUrls, ChannelPermissions, EncryptedAttachmentMeta, MessageData } from '@/types/chat';
import { extractMentionMetadata } from '@/utils/mentions';
import { uploadWithProgress } from '@/utils/uploadWithProgress';

type ChannelData = {
    id: number;
    name: string;
    topic?: string | null;
    other_user?: {
        id: number;
        username: string;
        avatar_urls: AvatarUrls | null;
    };
};

type Props = {
    channel?: ChannelData;
    isDm?: boolean;
    channelPermissions?: ChannelPermissions;
    usersCollapsed?: boolean;
};

const emit = defineEmits<{
    toggleUsersCollapsed: [];
}>();

const props = withDefaults(defineProps<Props>(), {
    isDm: false,
    usersCollapsed: false,
});

const authStore = useAuthStore();
const e2eeStore = useE2eeStore();
const e2ee = useE2EE();
const threadStore = useThreadStore();
const currentUser = computed(() => authStore.user);

const channelId = computed(() => props.channel?.id);
const isDmRef = computed(() => props.isDm);

const { isRateLimited, sendError, startRateLimitCooldown } = useRateLimit();

const showSearch = shallowRef(false);
const uploadingFiles = ref<UploadingFile[]>([]);
const editingMessageId = shallowRef<number | null>(null);
const editContent = shallowRef('');
const emojiPickerMessageId = shallowRef<number | null>(null);
const replyingToMessage = shallowRef<MessageData | null>(null);

const activeStore = useActiveStore(isDmRef);
const activeMessages = activeStore.messages;

const messagesContainer = useTemplateRef<HTMLElement>('messagesContainer');
const virtualItemEls = shallowRef<Element[]>([]);

const {
    rowVirtualizer,
    virtualItems,
    totalSize,
    isLoadingMore,
    isVisible,
    scrollToBottom,
    resetToBottom,
    handleScroll,
} = useScrollManager(messagesContainer, activeMessages, virtualItemEls, async () => {
    await activeStore.loadOlderMessages();
    if (e2eeStore.isReady) {
        await e2ee.lookupDecryptedCache(activeMessages.value);
        const hasUnresolved = activeMessages.value.some((m) => m.decrypted_content === undefined && !m.decrypt_error);
        if (hasUnresolved && channelId.value) {
            const groupId = isDmRef.value ? `dm:${channelId.value}` : `channel:${channelId.value}`;
            await e2ee.decryptGroupHistory(groupId);
            await e2ee.lookupDecryptedCache(activeMessages.value);
        }
        const chId = isDmRef.value ? undefined : channelId.value;
        const dmId = isDmRef.value ? channelId.value : undefined;
        await e2ee.decryptMessages(activeMessages.value, chId, dmId);
    }
});

const typingIndicator = useTypingIndicator(
    channelId,
    isDmRef,
    computed(() => currentUser.value?.id),
);
const { typingUsers, emitTyping } = typingIndicator;

const {
    pinnedMessages,
    showPinnedMessages,
    isLoadingPinned,
    fetchAndDecryptPinned,
    togglePinnedPanel,
    togglePin,
    unpinFromPanel,
} = usePinnedMessages(channelId, isDmRef, activeMessages);

useChannelRealtime({
    channelId,
    isDm: isDmRef,
    messages: activeMessages,
    isLoadingMessages: activeStore.isLoadingMessages,
    addMessage: activeStore.addMessage,
    updateMessage: activeStore.updateMessage,
    removeMessage: activeStore.removeMessage,
    scrollToBottom,
    resetToBottom,
    handleTypingEvent: typingIndicator.handleTypingEvent,
    clearTypingUser: typingIndicator.clearTypingUser,
    clearAll: typingIndicator.clearAll,
    pinnedMessages,
    showPinnedMessages,
    fetchAndDecryptPinned,
});

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

watch(activeStore.isLoadingMessages, (loading) => {
    if (loading) isVisible.value = false;
});

onMounted(() => {
    document.addEventListener('click', handleClickOutside);
    scrollToBottom(true);
});

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside);
});

const sendMessage = async (content: string, files: StagedFile[] = []) => {
    if (!props.channel?.id) return;

    if (isRateLimited.value) {
        return;
    }

    sendError.value = null;

    const mentionMeta = extractMentionMetadata(content);

    if (!e2eeStore.isReady) {
        sendError.value = 'Encryption is not set up. Please complete E2EE setup before sending messages.';
        return;
    }

    if (files.length > 0) {
        uploadingFiles.value = files.map((f) =>
            UploadingFileSchema.parse({
                id: f.id,
                name: f.file.name,
                size: f.file.size,
                progress: 0,
                status: 'preparing' as const,
                preview: f.preview,
            }),
        );
    }

    const attachmentMetas: EncryptedAttachmentMeta[] = [];
    const attachmentIds: string[] = [];

    for (const staged of files) {
        try {
            const isImage = staged.file.type.startsWith('image/');
            const isVideo = staged.file.type.startsWith('video/');

            const presignEndpoint = props.isDm
                ? `/direct-messages/${props.channel.id}/attachments/presign`
                : `/channels/${props.channel.id}/attachments/presign`;

            const presignResponse = await api.post(presignEndpoint, {
                file_size: staged.file.size,
                has_thumbnail: isImage || isVideo,
            });

            const { attachment_id, upload_url, upload_headers, thumbnail_upload_url, thumbnail_upload_headers } =
                presignResponse.data;

            {
                const idx = uploadingFiles.value.findIndex((f) => f.id === staged.id);
                if (idx !== -1) uploadingFiles.value[idx].progress = 5;
            }

            {
                const idx = uploadingFiles.value.findIndex((f) => f.id === staged.id);
                if (idx !== -1) {
                    uploadingFiles.value[idx].status = 'encrypting';
                    uploadingFiles.value[idx].progress = 15;
                }
            }
            const fileBuffer = await staged.file.arrayBuffer();
            const fileDataBase64 = btoa(
                new Uint8Array(fileBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
            );
            const encrypted = await window.api.attachments.encrypt(fileDataBase64);

            {
                const idx = uploadingFiles.value.findIndex((f) => f.id === staged.id);
                if (idx !== -1) {
                    uploadingFiles.value[idx].status = 'uploading';
                    uploadingFiles.value[idx].progress = 30;
                }
            }
            const binaryData = Uint8Array.from(atob(encrypted.encrypted), (c) => c.charCodeAt(0));
            const uploadResponse = await uploadWithProgress(
                upload_url,
                binaryData,
                {
                    'Content-Type': 'application/octet-stream',
                    ...(upload_headers ?? {}),
                },
                (progress) => {
                    const idx = uploadingFiles.value.findIndex((f) => f.id === staged.id);
                    if (idx !== -1) uploadingFiles.value[idx].progress = 30 + Math.round(progress * 0.6);
                },
            );

            if (!uploadResponse.ok) {
                throw new Error(`S3 upload failed with status ${uploadResponse.status}`);
            }

            let thumbnailMeta: Partial<EncryptedAttachmentMeta> = {};
            if (isImage && thumbnail_upload_url) {
                const thumbResult = await window.api.attachments.generateThumbnail({
                    fileDataBase64,
                    mimeType: staged.file.type,
                });

                if (thumbResult) {
                    const thumbBinary = Uint8Array.from(atob(thumbResult.thumbnailEncrypted), (c) => c.charCodeAt(0));
                    const thumbResponse = await fetch(thumbnail_upload_url, {
                        method: 'PUT',
                        body: thumbBinary,
                        headers: {
                            'Content-Type': 'application/octet-stream',
                            ...(thumbnail_upload_headers ?? {}),
                        },
                    });

                    if (!thumbResponse.ok) {
                        throw new Error(`Thumbnail upload failed with status ${thumbResponse.status}`);
                    }

                    thumbnailMeta = {
                        thumbnail_key: thumbResult.thumbnailKey,
                        thumbnail_iv: thumbResult.thumbnailIv,
                        thumbnail_width: thumbResult.width,
                        thumbnail_height: thumbResult.height,
                    };
                }
            }

            if (isVideo && thumbnail_upload_url) {
                try {
                    const videoThumb = await window.api.attachments.generateVideoThumbnail({
                        fileDataBase64,
                        mimeType: staged.file.type,
                    });
                    if (!videoThumb) throw new Error('ffmpeg returned no thumbnail');
                    const thumbBase64 = videoThumb.dataUrl.split(',')[1];
                    const thumbEncrypted = await window.api.attachments.encrypt(thumbBase64);

                    const thumbBinary = Uint8Array.from(atob(thumbEncrypted.encrypted), (c) => c.charCodeAt(0));
                    const thumbResponse = await fetch(thumbnail_upload_url, {
                        method: 'PUT',
                        body: thumbBinary,
                        headers: {
                            'Content-Type': 'application/octet-stream',
                            ...(thumbnail_upload_headers ?? {}),
                        },
                    });

                    if (!thumbResponse.ok) {
                        throw new Error(`Video thumbnail upload failed with status ${thumbResponse.status}`);
                    }

                    thumbnailMeta = {
                        thumbnail_key: thumbEncrypted.key,
                        thumbnail_iv: thumbEncrypted.iv,
                        thumbnail_width: videoThumb.width,
                        thumbnail_height: videoThumb.height,
                    };
                } catch (err) {
                    console.warn('Video thumbnail generation failed, continuing without thumbnail:', err);
                }
            }

            {
                const idx = uploadingFiles.value.findIndex((f) => f.id === staged.id);
                if (idx !== -1) {
                    uploadingFiles.value[idx].status = 'finishing';
                    uploadingFiles.value[idx].progress = 95;
                }
            }
            await api.post(`/attachments/${attachment_id}/confirm`);

            attachmentIds.push(attachment_id);
            attachmentMetas.push({
                id: attachment_id,
                key: encrypted.key,
                iv: encrypted.iv,
                file_name: staged.file.name,
                mime_type: staged.file.type || 'application/octet-stream',
                size: staged.file.size,
                ...thumbnailMeta,
                ...(staged.preview ? { thumbnail_data_url: staged.preview } : {}),
            });
        } catch (err) {
            console.error('Failed to upload attachment:', err);
            sendError.value = `Failed to upload ${staged.file.name}. Please try again.`;
            uploadingFiles.value = [];
            return;
        }
    }

    uploadingFiles.value = [];

    let messageContent = content;

    const envelopeMetas: EncryptedAttachmentMeta[] | undefined =
        attachmentMetas.length > 0
            ? attachmentMetas.map((meta) => {
                  const copy = { ...meta };
                  delete copy.thumbnail_data_url;
                  return copy;
              })
            : undefined;

    try {
        if (props.isDm) {
            messageContent = await e2ee.encryptForDM(props.channel.id, content, envelopeMetas);
        } else {
            messageContent = await e2ee.encryptForChannel(props.channel.id, content, envelopeMetas);
        }
    } catch {
        sendError.value = 'Failed to encrypt message. Please try again.';
        return;
    }

    let historyCiphertext: string | undefined;
    try {
        const groupId = props.isDm ? `dm:${props.channel.id}` : `channel:${props.channel.id}`;
        historyCiphertext = await e2ee.encryptHistory(groupId, content, envelopeMetas);
    } catch {
        // History encryption is best-effort; don't block the message
    }

    const data: {
        message_bytes: string;
        reply_to_id?: number;
        sender_device_id?: string;
        mention_user_ids?: number[];
        mention_everyone?: boolean;
        mention_here?: boolean;
        history_ciphertext?: string;
        epoch?: number;
        attachment_ids?: string[];
    } = {
        message_bytes: messageContent,
    };

    if (attachmentIds.length > 0) {
        data.attachment_ids = attachmentIds;
    }

    {
        const senderDeviceId = await e2ee.getDeviceId();
        if (senderDeviceId) data.sender_device_id = senderDeviceId;
    }

    if (historyCiphertext) {
        data.history_ciphertext = historyCiphertext;
    }

    {
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
            avatar_urls: null,
        },
        reactions: [],
        created_at: new Date().toISOString(),
        decrypted_content: content,
        decrypted_attachments: attachmentMetas.length > 0 ? attachmentMetas : undefined,
    };

    activeStore.addMessage(optimisticMessage);
    nextTick(() => scrollToBottom(true));
    replyingToMessage.value = null;

    try {
        const response = await api.post(endpoint, data);

        if (response.data) {
            const serverMsg = response.data as MessageData;
            serverMsg.decrypted_content = content;
            serverMsg.decrypted_attachments = attachmentMetas.length > 0 ? attachmentMetas : undefined;
            e2ee.cacheDecryptedContent(
                serverMsg.id,
                content,
                {
                    conversationType: props.isDm ? 'dm' : 'channel',
                    conversationId: props.channel!.id,
                    userName: (currentUser.value as any)?.username ?? currentUser.value!.name,
                },
                envelopeMetas,
            ).catch(() => {});
            const idx = activeMessages.value.findIndex((m) => m.id === optimisticMessage.id);
            if (idx !== -1) {
                activeMessages.value.splice(idx, 1, serverMsg);
            }
        }
    } catch (error: any) {
        activeStore.removeMessage(optimisticMessage.id);

        if (error?.response?.status === 429) {
            const retryAfter = parseInt(error.response.headers?.['retry-after'] ?? '60', 10);
            startRateLimitCooldown(retryAfter);
        } else {
            sendError.value = 'Failed to send message. Please try again.';
        }
    }
};

const openThread = (message: MessageData) => {
    if (!props.channel?.id || props.isDm) return;
    threadStore.openThread(props.channel.id, message);
};

const startReply = (message: MessageData) => {
    replyingToMessage.value = message;
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
    if (!editContent.value.trim() || !props.channel?.id) return;

    const endpoint = props.isDm
        ? `/direct-messages/${props.channel.id}/messages/${message.id}`
        : `/channels/${props.channel.id}/messages/${message.id}`;

    try {
        let contentToSend = editContent.value;
        if (!e2eeStore.isReady) return;

        try {
            if (props.isDm) {
                contentToSend = await e2ee.encryptForDM(
                    props.channel.id,
                    editContent.value,
                    message.decrypted_attachments,
                );
            } else {
                contentToSend = await e2ee.encryptForChannel(
                    props.channel.id,
                    editContent.value,
                    message.decrypted_attachments,
                );
            }
        } catch {
            return;
        }

        let historyCiphertext: string | undefined;
        try {
            const groupId = props.isDm ? `dm:${props.channel.id}` : `channel:${props.channel.id}`;
            historyCiphertext = await e2ee.encryptHistory(groupId, editContent.value, message.decrypted_attachments);
        } catch {
            // Best-effort
        }

        await api.put(endpoint, {
            message_bytes: contentToSend,
            sender_device_id: await e2ee.getDeviceId(),
            ...(historyCiphertext && { history_ciphertext: historyCiphertext }),
        });
        activeStore.updateMessage(message.id, {
            is_edited: true,
            edited_at: new Date().toISOString(),
            decrypted_content: editContent.value,
        });
        e2ee.cacheDecryptedContent(
            message.id,
            editContent.value,
            {
                conversationType: props.isDm ? 'dm' : 'channel',
                conversationId: props.channel!.id,
                userName: (currentUser.value as any)?.username ?? currentUser.value!.name,
            },
            message.decrypted_attachments,
        ).catch(() => {});
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
        activeStore.removeMessage(message.id);
        e2ee.removeFromSearchIndex(message.id).catch(() => {});
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
</script>

<template>
    <div class="flex h-full min-h-0 flex-1">
        <div class="bg-background relative flex h-full min-h-0 min-w-0 flex-1 flex-col">
            <div class="border-border flex h-12 items-center border-b px-4 shadow-sm">
                <Hash v-if="!isDm" :size="20" class="text-muted-foreground mr-2" />
                <MessageSquare v-else :size="20" class="text-muted-foreground mr-2" />
                <div class="flex-1">
                    <h2 class="flex items-center gap-1.5 font-semibold">
                        {{ channel?.name || 'Select a channel' }}
                    </h2>
                    <p v-if="channel?.topic" class="text-muted-foreground text-xs">
                        {{ channel.topic }}
                    </p>
                </div>

                <div class="ml-4 flex items-center gap-2">
                    <div class="relative">
                        <button
                            class="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1 transition-colors"
                            :class="{ 'bg-muted text-foreground': showPinnedMessages }"
                            title="Pinned messages"
                            @click="togglePinnedPanel"
                        >
                            <Pin :size="18" />
                        </button>
                        <PinnedMessagesPanel
                            v-if="showPinnedMessages && channel"
                            :pinned-messages="pinnedMessages"
                            :is-loading="isLoadingPinned"
                            :can-unpin="isDm || (channelPermissions?.canPinMessages ?? false)"
                            @close="showPinnedMessages = false"
                            @unpin="unpinFromPanel"
                        />
                    </div>
                    <button
                        v-if="e2eeStore.isReady"
                        class="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1 transition-colors"
                        :class="{ 'bg-muted text-foreground': showSearch }"
                        title="Search messages"
                        @click="showSearch = !showSearch"
                    >
                        <Search :size="18" />
                    </button>
                    <NotificationBell />
                    <button
                        class="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
                        :title="usersCollapsed ? 'Show members' : 'Hide members'"
                        @click="emit('toggleUsersCollapsed')"
                    >
                        <PanelRightOpen v-if="usersCollapsed" :size="16" />
                        <PanelRightClose v-else :size="16" />
                    </button>
                </div>
            </div>

            <div
                ref="messagesContainer"
                class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
                :class="{ invisible: !isVisible }"
                @scroll="handleScroll"
            >
                <div v-if="isLoadingMore" class="flex justify-center py-2">
                    <div class="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"></div>
                </div>

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

                <div v-else :style="{ height: `${totalSize}px`, width: '100%', position: 'relative' }">
                    <div
                        :style="{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualItems[0]?.start ?? 0}px)`,
                        }"
                    >
                        <div
                            v-for="vRow in virtualItems"
                            :key="vRow.index"
                            :data-index="vRow.index"
                            :ref="
                                (el) => {
                                    if (el) rowVirtualizer.measureElement(el as Element);
                                }
                            "
                        >
                            <Message
                                :message="activeMessages[vRow.index]"
                                :is-editing="editingMessageId === activeMessages[vRow.index].id"
                                :edit-content="editContent"
                                :show-emoji-picker="emojiPickerMessageId === activeMessages[vRow.index].id"
                                :can-manage-messages="channelPermissions?.canManageMessages ?? false"
                                :can-pin-messages="isDm || (channelPermissions?.canPinMessages ?? false)"
                                :can-add-reactions="channelPermissions?.canAddReactions ?? true"
                                :can-send-messages="channelPermissions?.canSendMessages ?? true"
                                :show-thread-button="!isDm"
                                @start-edit="startEdit(activeMessages[vRow.index])"
                                @cancel-edit="cancelEdit"
                                @save-edit="saveEdit(activeMessages[vRow.index])"
                                @delete="deleteMessage(activeMessages[vRow.index])"
                                @reply="startReply(activeMessages[vRow.index])"
                                @open-thread="openThread(activeMessages[vRow.index])"
                                @toggle-pin="togglePin(activeMessages[vRow.index])"
                                @toggle-reaction="(emoji) => toggleReaction(activeMessages[vRow.index], emoji)"
                                @toggle-emoji-picker="
                                    emojiPickerMessageId =
                                        emojiPickerMessageId === activeMessages[vRow.index].id
                                            ? null
                                            : activeMessages[vRow.index].id
                                "
                                @update-edit-content="editContent = $event"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <TypingIndicator :typing-users="typingUsers" />

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
                :disabled="isRateLimited"
                :can-attach-files="isDm || channelPermissions?.canAttachFiles !== false"
                :uploading-files="uploadingFiles"
                @send="sendMessage"
                @typing="emitTyping"
                @cancel-reply="replyingToMessage = null"
            />
            <div v-else class="border-border bg-muted/50 text-muted-foreground border-t px-4 py-3 text-center text-sm">
                You do not have permission to send messages in this channel.
            </div>

            <SearchMessages
                v-if="showSearch && channel"
                :conversation-type="isDm ? 'dm' : 'channel'"
                :conversation-id="channel.id"
                :conversation-name="isDm ? (channel.name ?? '') : `#${channel.name}`"
                @close="showSearch = false"
                @navigate-to-message="(id) => {}"
            />
        </div>
    </div>
</template>
