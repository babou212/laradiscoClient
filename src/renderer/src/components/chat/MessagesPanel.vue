<script setup lang="ts">
import { useEventListener } from '@vueuse/core';
import { Hash, MessageSquare, PanelRightClose, PanelRightOpen, Pin, Search } from 'lucide-vue-next';
import { computed, nextTick, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import NotificationBell from '@/components/NotificationBell.vue';
import { useActiveStore } from '@/composables/useActiveStore';
import { useChannelRealtime } from '@/composables/useChannelRealtime';
import { useE2EE } from '@/composables/useE2EE';
import { usePinnedMessages } from '@/composables/usePinnedMessages';
import { useRateLimit } from '@/composables/useRateLimit';
import { useScrollManager } from '@/composables/useScrollManager';
import { useTypingIndicator } from '@/composables/useTypingIndicator';
import { normalizeMessage } from '@/api/normalizers';
import { sendMessage as apiSendMessage, editMessage as apiEditMessage, deleteMessage as apiDeleteMessage } from '@/api/messages';
import { sendDmMessage, editDmMessage, deleteDmMessage } from '@/api/direct-messages';
import { toggleChannelReaction, toggleDmReaction } from '@/api/reactions';
import { presignChannelAttachment, presignDmAttachment, confirmAttachment } from '@/api/attachments';
import { UploadingFileSchema } from '@/lib/message-schemas';
import type { UploadingFile } from '@/lib/message-schemas';
import type { StagedFile } from '@/lib/message-schemas';
import { useAuthStore } from '@/stores/auth';
import { useE2eeStore } from '@/stores/e2ee';
import { useThreadStore } from '@/stores/thread';
import type { AvatarUrls, ChannelPermissions, EncryptedAttachmentMeta, MessageData } from '@/types/chat';
import { extractMentionMetadata } from '@/utils/mentions';
import { uploadWithProgress } from '@/utils/uploadWithProgress';
import Message from './Message.vue';
import MessageInput from './MessageInput.vue';
import PinnedMessagesPanel from './PinnedMessagesPanel.vue';
import SearchMessages from './SearchMessages.vue';
import TypingIndicator from './TypingIndicator.vue';

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
const channelIdStr = computed(() => props.channel?.id != null ? String(props.channel.id) : undefined);
const isDmRef = computed(() => props.isDm);

const { isRateLimited, sendError, startRateLimitCooldown } = useRateLimit();

const showSearch = shallowRef(false);
const uploadingFiles = ref<UploadingFile[]>([]);
const editingMessageId = shallowRef<string | null>(null);
const editContent = shallowRef('');
const emojiPickerMessageId = shallowRef<string | null>(null);
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
        const chId = isDmRef.value ? undefined : Number(channelId.value);
        const dmId = isDmRef.value ? Number(channelId.value) : undefined;
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
    channelId: channelIdStr,
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

let groupReadyPromise: Promise<void> | null = null;

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
        const groupId = isDm ? `dm:${channelId}` : `channel:${channelId}`;
        const type = isDm ? 'dm' : 'channel';
        groupReadyPromise = e2ee
            .ensureGroupReady(groupId, channelId, type)
            .then(() => {})
            .catch(() => {});
    } else {
        groupReadyPromise = null;
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

                if (e2eeStore.isReady) {
                    try {
                        const chId = props.isDm ? undefined : props.channel?.id;
                        const dmId = props.isDm ? props.channel?.id : undefined;
                        await e2ee.decryptMessageQueued(data.message, chId, dmId);
                    } catch {
                        if (!data.message.decrypted_content) {
                            data.message.decrypted_content = '[Message sent from another device]';
                        }
                    }
                } else {
                    data.message.decrypted_content = '[Message sent from another device]';
                }

                activeAddMessage(data.message);
                scrollToBottom();
                return;
            }

            if (e2eeStore.isReady) {
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
                        update.decrypt_error = false;
                    } else {
                        update.decrypt_error = true;
                    }
                } else {
                    try {
                        const chId = props.isDm ? undefined : props.channel?.id;
                        const dmId = props.isDm ? props.channel?.id : undefined;
                        const plaintext = await e2ee.decrypt(
                            data.message.content,
                            chId,
                            dmId,
                            data.message.id,
                            data.message.user?.username,
                        );
                        update.decrypted_content = plaintext;
                        update.decrypt_error = false;
                    } catch {
                        update.decrypt_error = true;
                    }
                }
            }

            activeUpdateMessage(data.message.id, update);
        })
        .listen('MessageDeleted', (data: { message_id: number }) => {
            activeRemoveMessage(data.message_id);
            e2ee.removeFromSearchIndex(data.message_id).catch(() => {});
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
        .listen('MessagePinned', (data: { message_id: number; pinned_by?: { id: number; username: string } }) => {
            const msg = activeMessages.value.find((m) => m.id === data.message_id);
            if (msg) {
                msg.is_pinned = true;
                msg.pinned_at = new Date().toISOString();
            }
            if (showPinnedMessages.value) {
                fetchPinnedMessages().then(async () => {
                    if (e2eeStore.isReady && pinnedMessages.value.length > 0) {
                        const chId = props.isDm ? undefined : props.channel?.id;
                        const dmId = props.isDm ? props.channel?.id : undefined;
                        e2ee.decryptMessages(pinnedMessages.value, chId, dmId);
                    }
                });
            }
        })
        .listen('MessageUnpinned', (data: { message_id: number }) => {
            const msg = activeMessages.value.find((m) => m.id === data.message_id);
            if (msg) {
                msg.is_pinned = false;
                msg.pinned_at = null;
            }
            const pinnedIdx = pinnedMessages.value.findIndex((m) => m.id === data.message_id);
            if (pinnedIdx !== -1) pinnedMessages.value.splice(pinnedIdx, 1);
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
        .listen(
            'MlsMessageReceived',
            async (data: { group_id: string; message_type: string; epoch: number; sender_device_id: string }) => {
                if (e2eeStore.isReady) {
                    try {
                        await e2ee.handleMlsMessage(data.group_id, data);
                        const chId = props.isDm ? undefined : props.channel?.id;
                        const dmId = props.isDm ? props.channel?.id : undefined;
                        await e2ee.retryPendingDecryptions(activeMessages.value, chId, dmId);
                    } catch (error) {
                        console.error(error);
                    }
                }
            },
        )
        .listen(
            'ThreadUpdated',
            (data: {
                message_id: number;
                thread: { id: number; message_count: number; last_message_at: string };
                last_reply?: {
                    id: number;
                    content: string;
                    user: { id: number; username: string; avatar_path: string | null };
                    created_at: string;
                    sender_device_id?: string;
                };
            }) => {
                const msg = activeMessages.value.find((m) => m.id === data.message_id);
                if (msg) {
                    const threadPreview: ThreadPreview = {
                        id: data.thread.id,
                        message_count: data.thread.message_count,
                        last_message_at: data.thread.last_message_at,
                        is_following: msg.thread?.is_following,
                    };
                    if (data.last_reply) {
                        threadPreview.last_reply = data.last_reply;
                    }
                    msg.thread = threadPreview;
                }
            },
        );
};

const leaveChannel = () => {
    clearPendingDecryptRetry();
    groupReadyPromise = null;
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
            showPinnedMessages.value = false;
            pinnedMessages.value = [];
            threadStore.closeThread();

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
            await e2ee.lookupDecryptedCache(activeMessages.value);

            const hasUnresolved = activeMessages.value.some(
                (m) => m.decrypted_content === undefined && !m.decrypt_error,
            );

            if (hasUnresolved) {
                if (groupReadyPromise) {
                    await groupReadyPromise;
                    groupReadyPromise = null;
                }

                const stillUnresolved = activeMessages.value.some(
                    (m) => m.decrypted_content === undefined && !m.decrypt_error,
                );
                if (stillUnresolved) {
                    const groupId = props.isDm ? `dm:${props.channel.id}` : `channel:${props.channel.id}`;
                    await e2ee.decryptGroupHistory(groupId);
                    await e2ee.lookupDecryptedCache(activeMessages.value);
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
                            (m) => m.decrypted_content === undefined && !m.decrypt_error,
                        );
                        if (!hasPending || retryCount > 3) {
                            clearPendingDecryptRetry();
                            return;
                        }
                        if (props.channel?.id) {
                            const chId = props.isDm ? undefined : props.channel.id;
                            const dmId = props.isDm ? props.channel.id : undefined;
                            await e2ee.retryPendingDecryptions(activeMessages.value, chId, dmId);
                        }
                    }, 15_000);
                }
            }
        }
        userIsNearBottom.value = true;
        scrollToBottom(true);
    }
});

useEventListener(document, 'click', handleClickOutside);

onMounted(() => {
    scrollToBottom(true);
});

onUnmounted(() => {
    leaveChannel();
    cancelScrollRetry();
    clearPendingDecryptRetry();
    if (rateLimitTimer) clearInterval(rateLimitTimer);
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
            await e2ee.lookupDecryptedCache(activeMessages.value);

            const hasUnresolved = activeMessages.value.some(
                (m) => m.decrypted_content === undefined && !m.decrypt_error,
            );
            if (hasUnresolved && props.channel?.id) {
                const groupId = props.isDm ? `dm:${props.channel.id}` : `channel:${props.channel.id}`;
                await e2ee.decryptGroupHistory(groupId);
                await e2ee.lookupDecryptedCache(activeMessages.value);
            }

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

    if (isRateLimited.value) {
        return;
    }

    sendError.value = null;

    const mentionMeta = extractMentionMetadata(content);

    let messageContent = content;

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

            const presignResponse = props.isDm
                ? await presignDmAttachment(props.channel.id, {
                      file_size: staged.file.size,
                      has_thumbnail: isImage || isVideo,
                  })
                : await presignChannelAttachment(props.channel.id, {
                      file_size: staged.file.size,
                      has_thumbnail: isImage || isVideo,
                  });

            const { attachment_id, upload_url, upload_headers, thumbnail_upload_url, thumbnail_upload_headers } =
                presignResponse;

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
            await confirmAttachment(attachment_id);

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
            e2ee.cacheDecryptedContent(
                Number(serverMsg.id),
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

        const editData = {
            message_bytes: contentToSend,
            sender_device_id: await e2ee.getDeviceId() ?? '',
            ...(historyCiphertext && { history_ciphertext: historyCiphertext }),
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
        if (response.meta.added) {
            message.reactions.push({
                id: String(0),
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
