<script setup lang="ts">
import { useEventListener } from '@vueuse/core';
import { Hash, MessageSquare, PanelRightClose, PanelRightOpen, Pin, Search } from 'lucide-vue-next';
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { uploadChannelAttachment, uploadDmAttachment } from '@/api/attachments';
import { sendDmMessage, editDmMessage, deleteDmMessage } from '@/api/direct-messages';
import {
    sendMessage as apiSendMessage,
    editMessage as apiEditMessage,
    deleteMessage as apiDeleteMessage,
    type SendMessageData,
} from '@/api/messages';
import { normalizeMessage } from '@/api/normalizers';
import { toggleChannelReaction, toggleDmReaction } from '@/api/reactions';
import MlsVerificationBadge from '@/components/chat/MlsVerificationBadge.vue';
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
import { useMessageOutbox } from '@/composables/useMessageOutbox';
import { useChannelRealtime } from '@/composables/useChannelRealtime';
import { useChatScroll } from '@/composables/useChatScroll';
import { usePinnedMessages } from '@/composables/usePinnedMessages';
import { useRateLimit } from '@/composables/useRateLimit';
import { useTypingIndicator } from '@/composables/useTypingIndicator';
import { extractFirstPreviewUrl } from '@/lib/extractUrls';
import { UploadingFileSchema } from '@/lib/message-schemas';
import type { UploadingFile } from '@/lib/message-schemas';
import type { StagedFile } from '@/lib/message-schemas';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import { useDirectMessagesStore } from '@/stores/directMessages';
import { usePresenceStore } from '@/stores/presence';
import { useServerStore } from '@/stores/server';
import { useThreadStore } from '@/stores/thread';
import type {
    Attachment,
    AvatarUrls,
    ChannelPermissions,
    LinkPreviewData,
    MessageData,
    MessageUser,
} from '@/types/chat';
import type { OnlineUser } from '@/types/user';
import { extractMentionMetadata } from '@/utils/mentions';
import Message from './Message.vue';
import MessageInput from './MessageInput.vue';
import MessageListSkeleton from './MessageListSkeleton.vue';
import NewMessagePill from './NewMessagePill.vue';
import PinnedMessagesPanel from './PinnedMessagesPanel.vue';
import SearchMessages from './SearchMessages.vue';
import TypingIndicator from './TypingIndicator.vue';
import UserProfilePanel from './UserProfilePanel.vue';

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
const serverStore = useServerStore();
const chatStore = useChatStore();
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
const peerUserId = computed(() =>
    props.isDm && props.channel?.other_user ? Number(props.channel.other_user.id) : null,
);
const draftKey = computed(() =>
    channelIdStr.value ? `${isDmRef.value ? 'dm' : 'channel'}:${channelIdStr.value}` : undefined,
);

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
const outbox = useMessageOutbox();
const activeMessages = activeStore.messages;
const isLoadingMessages = activeStore.isLoadingMessages;

const containerRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);

const {
    pinnedToBottom,
    unreadNewCount,
    isLoadingOlder,
    jumpToBottom,
    jumpToMessage,
    notifyNewMessage,
    scrollToBottom,
    resetForNewConversation,
} = useChatScroll({
    containerRef,
    contentRef,
    canLoadOlder: activeStore.canLoadMore,
    canLoadNewer: activeStore.canLoadNewer,
    isViewingHistory: activeStore.isViewingHistory,
    onLoadOlder: () => activeStore.loadOlderMessages(),
    onLoadNewer: () => activeStore.loadNewerMessages(),
    onLoadAround: (messageId: string) => activeStore.loadMessagesAround(messageId),
    onResetToLive: async () => {
        if (channelId.value) {
            await activeStore.resetToLive(String(channelId.value));
        }
    },
});

function resetForNewChannel(): void {
    resetForNewConversation();
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
    isViewingHistory: activeStore.isViewingHistory,
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
                const imageBlob = new Blob([imageBytes as BlobPart], { type: result.imageMime });
                const imageName = `image.${result.imageMime.split('/')[1] ?? 'png'}`;
                const uploadFn = props.isDm ? uploadDmAttachment : uploadChannelAttachment;
                const uploadResponse = await uploadFn(props.channel.id, imageBlob, imageName, null, {
                    width: result.imageWidth,
                    height: result.imageHeight,
                });
                preview.image = {
                    id: uploadResponse.attachment_id,
                    mime_type: result.imageMime,
                    size: imageBytes.length,
                    width: result.imageWidth,
                    height: result.imageHeight,
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

    if (props.isDm && peerUserId.value != null && (await window.api.mls.getRequireVerification())) {
        const v = await window.api.mls.localVerification(peerUserId.value);
        if (!v.verified) {
            sendError.value =
                'Verify this contact (shield icon) before sending — or turn off “require verification” in Settings → Security.';
            return;
        }
    }

    const mentionMeta = extractMentionMetadata(content);

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

    const optimisticAttachments: Attachment[] = [];
    const attachmentIds: string[] = [];

    for (const staged of files) {
        try {
            const isImage = staged.file.type.startsWith('image/');
            const isVideo = staged.file.type.startsWith('video/');

            const fileBytes = new Uint8Array(await staged.file.arrayBuffer());
            const fileBlob = new Blob([fileBytes], { type: staged.file.type || 'application/octet-stream' });

            let thumbnailBlob: Blob | null = null;
            let width: number | undefined;
            let height: number | undefined;

            if (isImage) {
                const thumbResult = await window.api.attachments.generateThumbnail({
                    fileData: fileBytes,
                    mimeType: staged.file.type,
                });
                if (thumbResult) {
                    thumbnailBlob = new Blob([thumbResult.thumbnail], { type: 'image/webp' });
                    width = thumbResult.width;
                    height = thumbResult.height;
                }
            }

            if (isVideo) {
                try {
                    const videoThumb = await window.api.attachments.generateVideoThumbnail({
                        fileData: fileBytes,
                        mimeType: staged.file.type,
                    });
                    if (videoThumb) {
                        const thumbBase64 = videoThumb.dataUrl.split(',')[1];
                        const thumbBytes = Uint8Array.from(atob(thumbBase64), (c) => c.charCodeAt(0));
                        thumbnailBlob = new Blob([thumbBytes], { type: 'image/webp' });
                        width = videoThumb.width;
                        height = videoThumb.height;
                    }
                } catch (err) {
                    console.warn('Video thumbnail generation failed, continuing without thumbnail:', err);
                }
            }

            {
                const idx = uploadingFiles.value.findIndex((f) => f.id === staged.id);
                if (idx !== -1) {
                    uploadingFiles.value[idx].status = 'uploading';
                    uploadingFiles.value[idx].progress = 10;
                }
            }

            const uploadFn = props.isDm ? uploadDmAttachment : uploadChannelAttachment;
            const uploadResponse = await uploadFn(
                props.channel.id,
                fileBlob,
                staged.file.name,
                thumbnailBlob,
                { width, height },
                (progress) => {
                    const idx = uploadingFiles.value.findIndex((f) => f.id === staged.id);
                    if (idx !== -1) uploadingFiles.value[idx].progress = 10 + Math.round(progress * 0.85);
                },
            );

            {
                const idx = uploadingFiles.value.findIndex((f) => f.id === staged.id);
                if (idx !== -1) {
                    uploadingFiles.value[idx].status = 'finishing';
                    uploadingFiles.value[idx].progress = 98;
                }
            }

            attachmentIds.push(uploadResponse.attachment_id);
            optimisticAttachments.push({
                id: uploadResponse.attachment_id,
                file_name: staged.file.name,
                mime_type: staged.file.type || 'application/octet-stream',
                size: staged.file.size,
                width: width ?? null,
                height: height ?? null,
                has_thumbnail: thumbnailBlob != null,
                thumbnail_size: uploadResponse.thumbnail_size ?? null,
                thumbnail_data_url: staged.preview,
            });
        } catch (err) {
            console.error('Failed to upload attachment:', err);
            sendError.value = t('chat.messages.failedToUpload', { fileName: staged.file.name });
            uploadingFiles.value = [];
            return;
        }
    }

    uploadingFiles.value = [];

    previewLoading.value = true;
    let linkPreview: LinkPreviewData | null = null;
    try {
        if (!props.isDm) linkPreview = await buildLinkPreviewWithTimeout(content);
    } finally {
        previewLoading.value = false;
    }
    if (linkPreview?.image?.id) {
        attachmentIds.push(linkPreview.image.id);
    }

    const clientTempId = crypto.randomUUID();

    const data: {
        content?: string;
        message_bytes?: string;
        epoch?: number;
        sender_device_id?: string;
        client_temp_id: string;
        reply_to_id?: string;
        mention_user_ids?: number[];
        mention_everyone?: boolean;
        mention_here?: boolean;
        attachment_ids?: string[];
        link_preview?: LinkPreviewData | null;
    } = {
        content,
        client_temp_id: clientTempId,
    };

    if (attachmentIds.length > 0) {
        data.attachment_ids = attachmentIds;
    }

    if (linkPreview) {
        data.link_preview = linkPreview;
    }

    if (mentionMeta.mentionEveryone) {
        data.mention_everyone = true;
    } else if (mentionMeta.mentionHere) {
        data.mention_here = true;
    } else if (mentionMeta.userIds.length > 0) {
        data.mention_user_ids = mentionMeta.userIds;
    }

    if (replyingToMessage.value) {
        data.reply_to_id = String(replyingToMessage.value.id);
    }

    const optimisticMessage: MessageData = {
        id: clientTempId,
        client_temp_id: clientTempId,
        content,
        is_edited: false,
        edited_at: null,
        deleted_at: null,
        reply_to_id: replyingToMessage.value?.id || null,
        reply_to: replyingToMessage.value
            ? {
                  id: replyingToMessage.value.id,
                  content: replyingToMessage.value.content,
                  user: replyingToMessage.value.user,
                  link_preview: replyingToMessage.value.link_preview,
              }
            : null,
        user: {
            id: currentUser.value!.id,
            username: currentUser.value!.username,
            avatar_urls: null,
        },
        reactions: [],
        created_at: new Date().toISOString(),
        attachments: optimisticAttachments.length > 0 ? optimisticAttachments : undefined,
        link_preview: linkPreview,
        send_status: 'sending',
    };

    if (props.isDm && content) {
        try {
            const enc = await encryptDmWithRetry(Number(props.channel.id), content);
            delete data.content;
            data.message_bytes = enc.message_bytes;
            data.epoch = enc.epoch;
            data.sender_device_id = enc.sender_device_id;
        } catch {
            sendError.value =
                'This message could not be encrypted, so it was not sent. Make sure encryption is set up, then try again.';
            return;
        }
    }

    if (activeStore.isViewingHistory.value && props.channel?.id) {
        await activeStore.resetToLive(String(props.channel.id));
        await nextTick();
    }

    await outbox.enqueue({
        clientTempId,
        channelId: String(props.channel.id),
        isDm: props.isDm,
        payload: data,
        optimistic: optimisticMessage,
        createdAt: optimisticMessage.created_at,
    });

    activeStore.addMessage(optimisticMessage);
    pinnedToBottom.value = true;
    nextTick(() => scrollToBottom());
    replyingToMessage.value = null;

    try {
        const response = props.isDm
            ? await sendDmMessage(String(props.channel.id), data)
            :
              await apiSendMessage(String(props.channel.id), data as SendMessageData);

        if (response.data) {
            const serverMsg = normalizeMessage(response.data, response.included);
            serverMsg.link_preview = linkPreview ?? serverMsg.link_preview;

            if (props.isDm && serverMsg.message_bytes && content) {
                serverMsg.content = content;
                void window.api.mls.cacheDm(Number(props.channel.id), serverMsg.id, content);
            }

            const serverIdx = activeMessages.value.findIndex((m) => m.id === serverMsg.id);
            const optimisticIdx = activeMessages.value.findIndex((m) => m.id === clientTempId);

            if (serverIdx !== -1) {
                if (optimisticIdx !== -1 && optimisticIdx !== serverIdx) {
                    activeMessages.value.splice(optimisticIdx, 1);
                }
                activeMessages.value[serverIdx].link_preview =
                    linkPreview ?? activeMessages.value[serverIdx].link_preview;
            } else if (optimisticIdx !== -1) {
                activeMessages.value.splice(optimisticIdx, 1, serverMsg);
            } else {
                activeStore.addMessage(serverMsg);
            }
        }
        await outbox.clear(clientTempId);
    } catch (error: unknown) {
        activeStore.updateMessage(clientTempId, { send_status: 'failed' });
        const axiosErr = error as { response?: { status?: number; headers?: Record<string, string> } };
        await outbox.enqueue({
            clientTempId,
            channelId: String(props.channel.id),
            isDm: props.isDm,
            payload: data,
            optimistic: { ...optimisticMessage, send_status: 'failed' },
            createdAt: optimisticMessage.created_at,
            error: axiosErr?.response?.status ? `HTTP ${axiosErr.response.status}` : t('chat.messages.failedToSend'),
        });

        if (axiosErr?.response?.status === 429) {
            const retryAfter = parseInt(axiosErr.response.headers?.['retry-after'] ?? '60', 10);
            startRateLimitCooldown(retryAfter);
        }
    }
};

const retryFailedMessage = async (message: MessageData) => {
    if (isRateLimited.value) return;
    sendError.value = null;
    try {
        await outbox.retry(message.id);
    } catch (error: unknown) {
        const axiosErr = error as { response?: { status?: number; headers?: Record<string, string> } };
        if (axiosErr?.response?.status === 429) {
            const retryAfter = parseInt(axiosErr.response.headers?.['retry-after'] ?? '60', 10);
            startRateLimitCooldown(retryAfter);
        } else {
            sendError.value = t('chat.messages.failedToSend');
        }
    }
};

const deleteFailedMessage = async (message: MessageData) => {
    await outbox.clear(message.id);
    activeStore.removeMessage(message.id);
};

const openThread = (message: MessageData) => {
    if (!props.channel?.id || props.isDm) return;
    threadStore.openThread(props.channel.id, message);
};

const onSearchNavigate = ({ messageId, threadId }: { messageId: number; threadId: string | null }) => {
    showSearch.value = false;
    if (threadId && !props.isDm && props.channel?.id) {
        threadStore.openThreadById(props.channel.id, threadId, messageId);
    } else {
        jumpToMessage(String(messageId));
    }
};

const startReply = (message: MessageData) => {
    replyingToMessage.value = message;
};

const startEdit = (message: MessageData) => {
    editingMessageId.value = message.id;
    editContent.value = message.content ?? '';
};

const cancelEdit = () => {
    editingMessageId.value = null;
    editContent.value = '';
};

/**
 * Encrypt a DM, self-healing a missing local MLS group. The group can be absent
 * when a send happens before establish/sync completed (or a Welcome hadn't been
 * pulled yet), which makes the WASM engine throw "group not found in storage".
 * On the first failure we re-run establish+sync once and retry. If the group
 * still can't be built (e.g. no Welcome exists at all), the second attempt
 * throws and the caller fails closed.
 */
async function encryptDmWithRetry(
    dmId: number,
    text: string,
): Promise<{ message_bytes: string; epoch: number; sender_device_id: string }> {
    try {
        return await window.api.mls.encryptDm(dmId, text);
    } catch {
        const host = serverStore.activeHost;
        const token = authStore.token;
        if (host && token) {
            await window.api.mls.establishDmGroup(host, token, dmId);
            await window.api.mls.syncDmGroup(host, token, dmId);
        }
        return await window.api.mls.encryptDm(dmId, text);
    }
}

const saveEdit = async (message: MessageData) => {
    if (!editContent.value.trim() || !props.channel?.id) return;

    try {
        if (props.isDm) {
            // Encrypt the edit as a new MLS message. Fail CLOSED — never PUT
            // plaintext content for an E2EE DM.
            let enc: { message_bytes: string; epoch: number; sender_device_id: string };
            try {
                enc = await encryptDmWithRetry(Number(props.channel.id), editContent.value);
            } catch {
                sendError.value = 'This edit could not be encrypted, so it was not saved.';
                return;
            }
            await editDmMessage(String(props.channel.id), String(message.id), {
                message_bytes: enc.message_bytes,
                epoch: enc.epoch,
                sender_device_id: enc.sender_device_id,
            });
            void window.api.mls.cacheDm(Number(props.channel.id), String(message.id), editContent.value);
        } else {
            await apiEditMessage(String(props.channel.id), String(message.id), { content: editContent.value });
        }
        activeStore.updateMessage(message.id, {
            content: editContent.value,
            is_edited: true,
            edited_at: new Date().toISOString(),
        });
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
                        <MlsVerificationBadge v-if="isDm && peerUserId != null" :peer-user-id="peerUserId" />
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
                    <SimpleTooltip :content="t('chat.messages.searchMessagesTooltip')">
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
                <MessageListSkeleton v-if="isLoadingMessages && activeMessages.length === 0" />

                <div v-else-if="activeMessages.length === 0" class="flex h-full items-center justify-center">
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

                <div
                    v-else
                    ref="containerRef"
                    class="h-full overflow-y-auto overscroll-contain px-4 pt-4 pb-4"
                    style="overflow-anchor: none"
                >
                    <div ref="contentRef">
                        <Message
                            v-for="item in activeMessages"
                            :key="item.id"
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
                            :is-rate-limited="isRateLimited"
                            @show-profile="(rect: DOMRect) => openUserProfile(item.user, rect)"
                            @retry="retryFailedMessage(item)"
                            @delete-failed="deleteFailedMessage(item)"
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
                        />
                    </div>
                </div>

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
                :draft-key="draftKey"
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
                @navigate-to-message="onSearchNavigate"
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
