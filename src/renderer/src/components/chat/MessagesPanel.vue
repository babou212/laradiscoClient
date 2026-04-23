<script setup lang="ts">
import { useEventListener } from '@vueuse/core';
import { Hash, MessageSquare, PanelRightClose, PanelRightOpen, Pin, Search } from 'lucide-vue-next';
import { VList } from 'virtua/vue';
import type { VListHandle } from 'virtua/vue';
import { computed, nextTick, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import Message from './Message.vue';
import MessageInput from './MessageInput.vue';
import NewMessagePill from './NewMessagePill.vue';
import PinnedMessagesPanel from './PinnedMessagesPanel.vue';
import SearchMessages from './SearchMessages.vue';
import TypingIndicator from './TypingIndicator.vue';
import UserProfilePanel from './UserProfilePanel.vue';
import { uploadChannelAttachment, uploadDmAttachment } from '@/api/attachments';
import { sendDmMessage, editDmMessage, deleteDmMessage } from '@/api/direct-messages';
import {
    sendMessage as apiSendMessage,
    editMessage as apiEditMessage,
    deleteMessage as apiDeleteMessage,
} from '@/api/messages';
import { normalizeMessage } from '@/api/normalizers';
import { toggleChannelReaction, toggleDmReaction } from '@/api/reactions';
import NotificationBell from '@/components/NotificationBell.vue';
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
import { useActiveStore } from '@/composables/useActiveStore';
import { useChannelRealtime } from '@/composables/useChannelRealtime';
import { useE2EE } from '@/composables/useE2EE';
import { usePinnedMessages } from '@/composables/usePinnedMessages';
import { useRateLimit } from '@/composables/useRateLimit';
import { useTypingIndicator } from '@/composables/useTypingIndicator';
import { useVirtualMessageScroll } from '@/composables/useVirtualMessageScroll';
import { extractFirstPreviewUrl } from '@/lib/extractUrls';
import { UploadingFileSchema } from '@/lib/message-schemas';
import type { UploadingFile } from '@/lib/message-schemas';
import type { StagedFile } from '@/lib/message-schemas';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import { useDirectMessagesStore } from '@/stores/directMessages';
import { useE2eeStore } from '@/stores/e2ee';
import { usePresenceStore } from '@/stores/presence';
import { useThreadStore } from '@/stores/thread';
import type {
    AvatarUrls,
    ChannelPermissions,
    EncryptedAttachmentMeta,
    LinkPreviewData,
    MessageData,
    MessageUser,
} from '@/types/chat';
import type { OnlineUser } from '@/types/user';
import { extractMentionMetadata } from '@/utils/mentions';

type ChannelData = {
    id: string;
    name: string;
    topic?: string | null;
    other_user?: {
        id: string;
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
const chatStore = useChatStore();
const e2eeStore = useE2eeStore();
const e2ee = useE2EE();
const presenceStore = usePresenceStore();
const dmStore = useDirectMessagesStore();
const router = useRouter();
const route = useRoute();
const threadStore = useThreadStore();
const currentUser = computed(() => authStore.user);
const { t } = useI18n();

const channelId = computed(() => props.channel?.id);
const channelIdNum = computed(() => (props.channel?.id != null ? Number(props.channel.id) : undefined));
const channelIdStr = computed(() => (props.channel?.id != null ? String(props.channel.id) : undefined));
const isDmRef = computed(() => props.isDm);

const { isRateLimited, sendError, startRateLimitCooldown } = useRateLimit();

const showSearch = shallowRef(false);
const uploadingFiles = ref<UploadingFile[]>([]);
const previewLoading = ref(false);
const editingMessageId = shallowRef<string | null>(null);
const editContent = shallowRef('');
const emojiPickerMessageId = shallowRef<string | null>(null);
const replyingToMessage = shallowRef<MessageData | null>(null);

const profileUser = shallowRef<OnlineUser | null>(null);
const showUserProfile = shallowRef(false);
const profileAnchor = shallowRef<{ x: number; y: number } | undefined>(undefined);

const openUserProfile = (messageUser: MessageUser, rect: DOMRect) => {
    const found = presenceStore.getUserStatus(messageUser.id);
    profileUser.value = found ?? {
        id: messageUser.id,
        username: messageUser.username,
        display_name: messageUser.username,
        avatar_urls: messageUser.avatar_urls,
        custom_status: null,
        status: 'offline',
    };
    profileAnchor.value = { x: rect.left, y: rect.bottom };
    showUserProfile.value = true;
};

const closeUserProfile = () => {
    showUserProfile.value = false;
    profileUser.value = null;
};

const startDmFromProfile = async (userId: string) => {
    closeUserProfile();
    try {
        const groupId = await dmStore.startOrGetDm(userId);
        if (groupId) {
            router.push({ name: 'direct-messages', params: { threadId: groupId } });
        }
    } catch (error) {
        if (import.meta.env.DEV) {
            console.error('Failed to start DM:', error);
        }
    }
};

const activeStore = useActiveStore(isDmRef);
const activeMessages = activeStore.messages;

const vlistRef = useTemplateRef<VListHandle>('vlistRef');

async function decryptAfterLoad(): Promise<void> {
    if (!e2eeStore.isReady) return;
    await e2ee.lookupDecryptedCache(activeMessages.value);
    const hasUnresolved = activeMessages.value.some((m) => m.decrypted_content === undefined && !m.decrypt_error);
    if (hasUnresolved && channelId.value) {
        await e2ee.lookupDecryptedCache(activeMessages.value);
    }
    const chId = isDmRef.value ? undefined : Number(channelId.value);
    const dmId = isDmRef.value ? Number(channelId.value) : undefined;
    await e2ee.decryptMessages(activeMessages.value, chId, dmId);
}

const {
    pinnedToBottom,
    unreadNewCount,
    isLoadingOlder,
    isPrepend,
    onScroll: handleVListScroll,
    jumpToBottom,
    jumpToMessage,
    notifyNewMessage,
    scrollToBottom,
    resetScroll,
} = useVirtualMessageScroll({
    vlistRef,
    messages: activeMessages,
    canLoadOlder: activeStore.canLoadMore,
    canLoadNewer: activeStore.canLoadNewer,
    isViewingHistory: activeStore.isViewingHistory,
    onLoadOlder: async () => {
        await activeStore.loadOlderMessages();
        await decryptAfterLoad();
    },
    onLoadNewer: async () => {
        await activeStore.loadNewerMessages();
        await decryptAfterLoad();
    },
    onLoadAround: async (messageId: string) => {
        await activeStore.loadMessagesAround(messageId);
        await decryptAfterLoad();
    },
    onResetToLive: async () => {
        if (channelId.value) {
            await activeStore.resetToLive(String(channelId.value));
            await decryptAfterLoad();
        }
    },
});

function resetForNewChannel(): void {
    resetScroll();
}

function maybeMarkChannelRead(): void {
    if (isDmRef.value) return;
    if (!pinnedToBottom.value) return;
    const ch = chatStore.currentChannel;
    if (ch?.has_unread && ch.id === String(channelId.value ?? '')) {
        chatStore.markChannelRead(ch.id);
    }
}

watch(pinnedToBottom, (bottom) => {
    if (bottom) maybeMarkChannelRead();
});

watch(
    () => chatStore.currentChannel?.has_unread,
    (hasUnread) => {
        if (hasUnread) maybeMarkChannelRead();
    },
);

const showPillForHistory = computed(() => activeStore.isViewingHistory.value);
const showPill = computed(() => !pinnedToBottom.value || showPillForHistory.value);

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
} = usePinnedMessages(channelIdNum, isDmRef, activeMessages);

useChannelRealtime({
    channelId: channelIdStr,
    isDm: isDmRef,
    messages: activeMessages,
    isLoadingMessages: activeStore.isLoadingMessages,
    addMessage: activeStore.addMessage,
    updateMessage: activeStore.updateMessage,
    removeMessage: activeStore.removeMessage,
    notifyNewMessage,
    resetForNewChannel,
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

useEventListener(document, 'click', handleClickOutside);

const handleUserContextAction = (e: Event) => {
    const detail = (
        e as CustomEvent<{
            action: string;
            userId: string;
            username: string;
            rect?: { left: number; top: number; right: number; bottom: number };
        }>
    ).detail;
    if (!detail) return;
    if (detail.action === 'view-profile') {
        const messageUser: MessageUser = {
            id: detail.userId,
            username: detail.username,
            avatar_urls: null,
        };
        const rect =
            detail.rect ??
            ({ left: window.innerWidth / 2, top: window.innerHeight / 2, right: 0, bottom: 0 } as DOMRect);
        openUserProfile(messageUser, rect as DOMRect);
        return;
    }
    if (detail.action === 'send-dm') {
        startDmFromProfile(detail.userId);
    }
};

useEventListener(document, 'chat-user-action', handleUserContextAction);

onMounted(() => {
    const queryMessageId = route.query.message;
    if (typeof queryMessageId === 'string' && queryMessageId) {
        watch(
            () => activeStore.isLoadingMessages.value,
            (loading, wasLoading) => {
                if (wasLoading && !loading) {
                    jumpToMessage(queryMessageId);
                }
            },
            { once: true },
        );
    }
});

const LINK_PREVIEW_TIMEOUT_MS = 6000;

async function buildLinkPreviewWithTimeout(content: string): Promise<LinkPreviewData | null> {
    const url = extractFirstPreviewUrl(content);
    if (!url) return null;
    if (!props.channel?.id) return null;

    try {
        const unfurlPromise = window.api.unfurl.fetch(url);
        const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), LINK_PREVIEW_TIMEOUT_MS));
        const result = await Promise.race([unfurlPromise, timeoutPromise]);
        if (!result || result.status !== 'ok') return null;

        const preview: LinkPreviewData = {
            url: result.metadata.url,
            title: result.metadata.title,
            description: result.metadata.description,
            site_name: result.metadata.site_name,
            image_url: result.metadata.image_url,
            image_width: result.imageWidth,
            image_height: result.imageHeight,
            fetched_at: Date.now(),
        };

        if (result.imageBytes && result.imageMime) {
            try {
                const imageBytes = result.imageBytes;
                const encrypted = await window.api.attachments.encrypt(imageBytes);
                const imageBlob = new Blob([encrypted.encrypted], { type: 'application/octet-stream' });
                const uploadFn = props.isDm ? uploadDmAttachment : uploadChannelAttachment;
                const uploadResponse = await uploadFn(props.channel.id, imageBlob, null);
                preview.image = {
                    id: uploadResponse.attachment_id,
                    key: encrypted.key,
                    iv: encrypted.iv,
                    file_name: 'preview',
                    mime_type: result.imageMime,
                    size: imageBytes.length,
                };
            } catch (err) {
                console.warn('[link preview] image upload failed:', err);
            }
        }

        return preview;
    } catch (err) {
        console.warn('[link preview] unfurl failed:', err);
        return null;
    }
}

const sendMessage = async (content: string, files: StagedFile[] = []) => {
    if (!props.channel?.id) return;

    if (isRateLimited.value) {
        return;
    }

    sendError.value = null;

    const mentionMeta = extractMentionMetadata(content);

    let messageContent = content;

    if (!e2eeStore.isReady) {
        sendError.value = t('chat.messages.encryptionNotSetUp');
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

            {
                const idx = uploadingFiles.value.findIndex((f) => f.id === staged.id);
                if (idx !== -1) {
                    uploadingFiles.value[idx].status = 'encrypting';
                    uploadingFiles.value[idx].progress = 10;
                }
            }
            const fileData = new Uint8Array(await staged.file.arrayBuffer());
            const encrypted = await window.api.attachments.encrypt(fileData);

            {
                const idx = uploadingFiles.value.findIndex((f) => f.id === staged.id);
                if (idx !== -1) {
                    uploadingFiles.value[idx].progress = 20;
                }
            }

            const fileBlob = new Blob([encrypted.encrypted], { type: 'application/octet-stream' });

            let thumbnailBlob: Blob | null = null;
            let thumbnailMeta: Partial<EncryptedAttachmentMeta> = {};

            if (isImage) {
                const thumbResult = await window.api.attachments.generateThumbnail({
                    fileData,
                    mimeType: staged.file.type,
                });

                if (thumbResult) {
                    thumbnailBlob = new Blob([thumbResult.thumbnailEncrypted], { type: 'application/octet-stream' });
                    thumbnailMeta = {
                        thumbnail_key: thumbResult.thumbnailKey,
                        thumbnail_iv: thumbResult.thumbnailIv,
                        thumbnail_width: thumbResult.width,
                        thumbnail_height: thumbResult.height,
                    };
                }
            }

            if (isVideo) {
                try {
                    const videoThumb = await window.api.attachments.generateVideoThumbnail({
                        fileData,
                        mimeType: staged.file.type,
                    });
                    if (!videoThumb) throw new Error('ffmpeg returned no thumbnail');
                    const thumbBase64 = videoThumb.dataUrl.split(',')[1];
                    const thumbBytes = Uint8Array.from(atob(thumbBase64), (c) => c.charCodeAt(0));
                    const thumbEncrypted = await window.api.attachments.encrypt(thumbBytes);

                    thumbnailBlob = new Blob([thumbEncrypted.encrypted], { type: 'application/octet-stream' });
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
                    uploadingFiles.value[idx].status = 'uploading';
                    uploadingFiles.value[idx].progress = 30;
                }
            }

            const uploadFn = props.isDm ? uploadDmAttachment : uploadChannelAttachment;
            const uploadResponse = await uploadFn(props.channel.id, fileBlob, thumbnailBlob, (progress) => {
                const idx = uploadingFiles.value.findIndex((f) => f.id === staged.id);
                if (idx !== -1) uploadingFiles.value[idx].progress = 30 + Math.round(progress * 0.65);
            });

            {
                const idx = uploadingFiles.value.findIndex((f) => f.id === staged.id);
                if (idx !== -1) {
                    uploadingFiles.value[idx].status = 'finishing';
                    uploadingFiles.value[idx].progress = 98;
                }
            }

            attachmentIds.push(uploadResponse.attachment_id);
            attachmentMetas.push({
                id: uploadResponse.attachment_id,
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
            sendError.value = t('chat.messages.failedToUpload', { fileName: staged.file.name });
            uploadingFiles.value = [];
            return;
        }
    }

    uploadingFiles.value = [];

    const envelopeMetas: EncryptedAttachmentMeta[] | undefined =
        attachmentMetas.length > 0
            ? attachmentMetas.map((meta) => {
                  const copy = { ...meta };
                  delete copy.thumbnail_data_url;
                  return copy;
              })
            : undefined;

    previewLoading.value = true;
    let linkPreview: LinkPreviewData | null;
    try {
        linkPreview = await buildLinkPreviewWithTimeout(content);
    } finally {
        previewLoading.value = false;
    }
    if (linkPreview?.image?.id) {
        attachmentIds.push(linkPreview.image.id);
    }

    try {
        if (props.isDm) {
            messageContent = await e2ee.encryptForDM(Number(props.channel.id), content, envelopeMetas, linkPreview);
        } else {
            messageContent = await e2ee.encryptForChannel(
                Number(props.channel.id),
                content,
                envelopeMetas,
                linkPreview,
            );
        }
    } catch {
        sendError.value = t('chat.messages.failedToEncrypt');
        return;
    }

    const data: {
        message_bytes: string;
        reply_to_id?: number;
        sender_device_id?: string;
        mention_user_ids?: number[];
        mention_everyone?: boolean;
        mention_here?: boolean;
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
        data.reply_to_id = Number(replyingToMessage.value.id);
    }

    const optimisticMessage: MessageData = {
        id: String(Date.now()),
        content,
        is_edited: false,
        edited_at: null,
        deleted_at: null,
        reply_to_id: replyingToMessage.value?.id || null,
        reply_to: replyingToMessage.value || null,
        user: {
            id: currentUser.value!.id,
            username: currentUser.value!.username ?? currentUser.value!.name,
            avatar_urls: null,
        },
        reactions: [],
        created_at: new Date().toISOString(),
        decrypted_content: content,
        decrypted_attachments: attachmentMetas.length > 0 ? attachmentMetas : undefined,
        link_preview: linkPreview,
    };

    activeStore.addMessage(optimisticMessage);
    pinnedToBottom.value = true;
    nextTick(() => scrollToBottom());
    replyingToMessage.value = null;

    try {
        const response = props.isDm
            ? await sendDmMessage(String(props.channel.id), {
                  message_bytes: data.message_bytes,
                  sender_device_id: data.sender_device_id ?? '',
                  reply_to_id: data.reply_to_id != null ? String(data.reply_to_id) : undefined,
                  attachment_ids: data.attachment_ids,
              })
            : await apiSendMessage(String(props.channel.id), {
                  message_bytes: data.message_bytes,
                  sender_device_id: data.sender_device_id ?? '',
                  reply_to_id: data.reply_to_id != null ? String(data.reply_to_id) : undefined,
                  attachment_ids: data.attachment_ids,
              });

        if (response.data) {
            const serverMsg = normalizeMessage(response.data, response.included);
            serverMsg.decrypted_content = content;
            serverMsg.decrypted_attachments = attachmentMetas.length > 0 ? attachmentMetas : undefined;
            serverMsg.link_preview = linkPreview;
            if (serverMsg.reply_to && optimisticMessage.reply_to) {
                serverMsg.reply_to.decrypted_content = optimisticMessage.reply_to.decrypted_content;
                serverMsg.reply_to.link_preview = optimisticMessage.reply_to.link_preview;
                serverMsg.reply_to.decrypt_error = optimisticMessage.reply_to.decrypt_error;
            }
            e2ee.cacheDecryptedContent(
                Number(serverMsg.id),
                content,
                {
                    conversationType: props.isDm ? 'dm' : 'channel',
                    conversationId: Number(props.channel!.id),
                    userName: currentUser.value?.username ?? currentUser.value!.name,
                },
                envelopeMetas,
                linkPreview,
            ).catch(() => {});
            const idx = activeMessages.value.findIndex((m) => m.id === optimisticMessage.id);
            if (idx !== -1) {
                activeMessages.value.splice(idx, 1, serverMsg);
            }
        }
    } catch (error: unknown) {
        activeStore.removeMessage(optimisticMessage.id);

        const axiosErr = error as { response?: { status?: number; headers?: Record<string, string> } };
        if (axiosErr?.response?.status === 429) {
            const retryAfter = parseInt(axiosErr.response.headers?.['retry-after'] ?? '60', 10);
            startRateLimitCooldown(retryAfter);
        } else {
            sendError.value = t('chat.messages.failedToSend');
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

    try {
        let contentToSend = editContent.value;
        if (!e2eeStore.isReady) return;

        try {
            if (props.isDm) {
                contentToSend = await e2ee.encryptForDM(
                    Number(props.channel.id),
                    editContent.value,
                    message.decrypted_attachments,
                );
            } else {
                contentToSend = await e2ee.encryptForChannel(
                    Number(props.channel.id),
                    editContent.value,
                    message.decrypted_attachments,
                );
            }
        } catch {
            return;
        }

        const editData = {
            message_bytes: contentToSend,
            sender_device_id: (await e2ee.getDeviceId()) ?? '',
        };
        if (props.isDm) {
            await editDmMessage(String(props.channel.id), String(message.id), editData);
        } else {
            await apiEditMessage(String(props.channel.id), String(message.id), editData);
        }
        activeStore.updateMessage(message.id, {
            is_edited: true,
            edited_at: new Date().toISOString(),
            decrypted_content: editContent.value,
        });
        e2ee.cacheDecryptedContent(
            Number(message.id),
            editContent.value,
            {
                conversationType: props.isDm ? 'dm' : 'channel',
                conversationId: Number(props.channel!.id),
                userName: currentUser.value?.username ?? currentUser.value!.name,
            },
            message.decrypted_attachments,
        ).catch(() => {});
        cancelEdit();
    } catch (error) {
        console.error('Failed to edit message:', error);
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
    if (!message || !props.channel?.id) return;

    try {
        if (props.isDm) {
            await deleteDmMessage(String(props.channel.id), String(message.id));
        } else {
            await apiDeleteMessage(String(props.channel.id), String(message.id));
        }
        activeStore.removeMessage(message.id);
        e2ee.removeFromSearchIndex(Number(message.id)).catch(() => {});
    } catch (error) {
        console.error('Failed to delete message:', error);
    } finally {
        showDeleteDialog.value = false;
        pendingDeleteMessage.value = null;
    }
};

const toggleReaction = async (message: MessageData, emoji: string) => {
    if (!props.channel?.id) return;
    emojiPickerMessageId.value = null;

    try {
        const response = props.isDm
            ? await toggleDmReaction(String(props.channel.id), String(message.id), { emoji })
            : await toggleChannelReaction(String(props.channel.id), String(message.id), { emoji });

        if (!message.reactions) message.reactions = [];
        const uid = String(currentUser.value!.id);
        if (response.meta.added) {
            const reactionId = String((response as { data?: { id?: number | string } }).data?.id ?? 0);
            const already = message.reactions.some((r) => String(r.user_id) === uid && r.emoji === emoji);
            if (!already) {
                message.reactions.push({
                    id: reactionId,
                    message_id: String(message.id),
                    user_id: uid,
                    emoji,
                });
            }
        } else {
            const idx = message.reactions.findIndex((r) => String(r.user_id) === uid && r.emoji === emoji);
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
                        {{ channel?.name || t('chat.messages.selectChannel') }}
                    </h2>
                    <p v-if="channel?.topic" class="text-muted-foreground text-xs">
                        {{ channel.topic }}
                    </p>
                </div>

                <div class="ml-4 flex items-center gap-2">
                    <div class="relative">
                        <SimpleTooltip :content="t('chat.messages.pinnedMessagesTooltip')">
                            <button
                                class="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1 transition-colors"
                                :class="{ 'bg-muted text-foreground': showPinnedMessages }"
                                @click="togglePinnedPanel"
                            >
                                <Pin :size="18" />
                            </button>
                        </SimpleTooltip>
                        <PinnedMessagesPanel
                            v-if="showPinnedMessages && channel"
                            :pinned-messages="pinnedMessages"
                            :is-loading="isLoadingPinned"
                            :can-unpin="isDm || (channelPermissions?.canPinMessages ?? false)"
                            @close="showPinnedMessages = false"
                            @unpin="unpinFromPanel"
                            @jump="
                                (id: string) => {
                                    showPinnedMessages = false;
                                    jumpToMessage(id);
                                }
                            "
                        />
                    </div>
                    <SimpleTooltip v-if="e2eeStore.isReady" :content="t('chat.messages.searchMessagesTooltip')">
                        <button
                            class="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1 transition-colors"
                            :class="{ 'bg-muted text-foreground': showSearch }"
                            @click="showSearch = !showSearch"
                        >
                            <Search :size="18" />
                        </button>
                    </SimpleTooltip>
                    <NotificationBell />
                    <SimpleTooltip
                        v-if="!isDm"
                        :content="usersCollapsed ? t('chat.messages.showMembers') : t('chat.messages.hideMembers')"
                    >
                        <button
                            class="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
                            @click="emit('toggleUsersCollapsed')"
                        >
                            <PanelRightOpen v-if="usersCollapsed" :size="16" />
                            <PanelRightClose v-else :size="16" />
                        </button>
                    </SimpleTooltip>
                </div>
            </div>

            <div class="relative min-h-0 flex-1">
                <div v-if="activeMessages.length === 0" class="flex h-full items-center justify-center">
                    <div class="text-muted-foreground text-center">
                        <MessageSquare v-if="isDm" :size="48" class="mx-auto mb-2 opacity-50" />
                        <Hash v-else :size="48" class="mx-auto mb-2 opacity-50" />
                        <p class="text-lg font-semibold">
                            {{
                                isDm
                                    ? t('chat.messages.conversationWith', { name: channel?.name ?? '' })
                                    : t('chat.messages.welcomeChannel', { channel: channel?.name ?? '' })
                            }}
                        </p>
                        <p class="text-sm">{{ t('chat.messages.conversationStart') }}</p>
                    </div>
                </div>

                <VList
                    v-else
                    ref="vlistRef"
                    :data="activeMessages"
                    :shift="isPrepend"
                    :buffer-size="4000"
                    class="h-full overscroll-contain px-4 pt-4"
                    @scroll="handleVListScroll"
                >
                    <template #default="{ item }: { item: MessageData }">
                        <Message
                            :message="item"
                            :is-editing="editingMessageId === item.id"
                            :edit-content="editContent"
                            :show-emoji-picker="emojiPickerMessageId === item.id"
                            :can-manage-messages="channelPermissions?.canManageMessages ?? false"
                            :can-pin-messages="isDm || (channelPermissions?.canPinMessages ?? false)"
                            :can-add-reactions="channelPermissions?.canAddReactions ?? true"
                            :can-send-messages="channelPermissions?.canSendMessages ?? true"
                            :show-thread-button="!isDm"
                            :is-dm="isDm"
                            @show-profile="(rect: DOMRect) => openUserProfile(item.user, rect)"
                            @start-edit="startEdit(item)"
                            @cancel-edit="cancelEdit"
                            @save-edit="saveEdit(item)"
                            @delete="deleteMessage(item)"
                            @reply="startReply(item)"
                            @open-thread="openThread(item)"
                            @toggle-pin="togglePin(item)"
                            @toggle-reaction="(emoji) => toggleReaction(item, emoji)"
                            @toggle-emoji-picker="
                                emojiPickerMessageId = emojiPickerMessageId === item.id ? null : item.id
                            "
                            @update-edit-content="editContent = $event"
                            @content-resize="pinnedToBottom && scrollToBottom()"
                        />
                    </template>
                </VList>

                <div
                    v-if="isLoadingOlder"
                    class="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center py-2"
                >
                    <div class="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"></div>
                </div>

                <div v-if="showPill" class="pointer-events-none absolute inset-x-0 bottom-2 z-10 flex justify-center">
                    <NewMessagePill
                        :count="unreadNewCount"
                        :viewing-history="showPillForHistory"
                        @click="jumpToBottom"
                    />
                </div>
            </div>

            <TypingIndicator :typing-users="typingUsers" />

            <div
                v-if="sendError"
                class="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 border-t px-4 py-2 text-sm"
            >
                <span class="flex-1">{{ sendError }}</span>
                <button class="hover:bg-destructive/20 shrink-0 rounded px-2 py-0.5 text-xs" @click="sendError = null">
                    {{ t('chat.common.dismiss') }}
                </button>
            </div>

            <div
                v-if="previewLoading"
                class="border-border text-muted-foreground flex items-center gap-2 border-t px-4 py-1.5 text-xs"
            >
                <span
                    class="border-muted-foreground/40 border-t-muted-foreground inline-block h-3 w-3 animate-spin rounded-full border-2"
                />
                <span>{{ t('chat.messages.fetchingLinkPreview') }}</span>
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
                {{ t('chat.messages.noPermissionToSend') }}
            </div>

            <SearchMessages
                v-if="showSearch && channel"
                :conversation-type="isDm ? 'dm' : 'channel'"
                :conversation-id="Number(channel.id)"
                :conversation-name="isDm ? (channel.name ?? '') : `#${channel.name}`"
                @close="showSearch = false"
                @navigate-to-message="(id: number) => jumpToMessage(String(id))"
            />
        </div>

        <UserProfilePanel
            :user="profileUser"
            :show="showUserProfile"
            :is-current-user="profileUser?.id === currentUser?.id"
            :anchor-position="profileAnchor"
            @close="closeUserProfile"
            @send-message="startDmFromProfile"
        />

        <Dialog v-model:open="showDeleteDialog">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{{ t('chat.messages.deleteDialogTitle') }}</DialogTitle>
                    <DialogDescription>
                        {{ t('chat.messages.deleteDialogDescription') }}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" @click="showDeleteDialog = false">{{ t('chat.messages.cancel') }}</Button>
                    <Button variant="destructive" @click="confirmDeleteMessage">{{
                        t('chat.messages.deleteConfirm')
                    }}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>

<style scoped></style>
