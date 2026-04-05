<script setup lang="ts">
import { useClipboard, useEventListener } from '@vueuse/core';
import { Pin } from 'lucide-vue-next';
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue';
import FileAttachment from './FileAttachment.vue';
import MessageActions from './MessageActions.vue';
import MessageReplyPreview from './MessageReplyPreview.vue';
import MessageYoutubeEmbed from './MessageYoutubeEmbed.vue';
import ThreadPreviewBadge from './ThreadPreviewBadge.vue';
import EncryptionBadge from '@/components/e2ee/EncryptionBadge.vue';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { checkIcon, renderMarkdownWithMentions } from '@/lib/markdown';
import { formatMessageDate } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import { useAvatarStore } from '@/stores/avatar';
import { useUserNamesStore } from '@/stores/userNames';
import type { MessageData } from '@/types/chat';

interface Props {
    message: MessageData;
    isEditing: boolean;
    editContent: string;
    showEmojiPicker: boolean;
    canManageMessages?: boolean;
    canPinMessages?: boolean;
    canAddReactions?: boolean;
    canSendMessages?: boolean;
    showThreadButton?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    showThreadButton: true,
});

const emit = defineEmits<{
    startEdit: [];
    cancelEdit: [];
    saveEdit: [];
    delete: [];
    reply: [];
    openThread: [];
    togglePin: [];
    toggleReaction: [emoji: string];
    toggleEmojiPicker: [];
    updateEditContent: [content: string];
}>();

const authStore = useAuthStore();
const avatarStore = useAvatarStore();
const userNamesStore = useUserNamesStore();
const currentUser = computed(() => authStore.user);

const isOwnMessage = computed(() => props.message.user.id === currentUser.value?.id);
const canEdit = computed(() => isOwnMessage.value);
const canDelete = computed(() => isOwnMessage.value || props.canManageMessages);
const canPin = computed(() => props.canPinMessages === true);
const canReact = computed(() => props.canAddReactions !== false);
const canReply = computed(() => props.canSendMessages !== false);
const canThread = computed(() => props.showThreadButton && props.canSendMessages !== false);

const isDecrypting = computed(() => {
    return !props.message.decrypt_error && props.message.decrypted_content === undefined;
});

const displayContent = computed(() => {
    if (props.message.decrypt_error) return '[Unable to decrypt this message]';
    return props.message.decrypted_content ?? '';
});

const isReplyDecrypting = computed(() => {
    if (!props.message.reply_to) return false;
    const reply = props.message.reply_to;
    return !reply.decrypt_error && !reply.decrypted_content;
});

const replyDisplayContent = computed(() => {
    if (!props.message.reply_to) return '';
    const reply = props.message.reply_to;
    if (reply.decrypt_error) return '[Unable to decrypt]';
    return reply.decrypted_content ?? '';
});

const groupedReactions = computed(() => {
    const map = new Map<string, { emoji: string; count: number; userReacted: boolean }>();
    for (const r of props.message.reactions) {
        const existing = map.get(r.emoji);
        if (existing) {
            existing.count++;
            if (r.user_id === currentUser.value?.id) existing.userReacted = true;
        } else {
            map.set(r.emoji, {
                emoji: r.emoji,
                count: 1,
                userReacted: r.user_id === currentUser.value?.id,
            });
        }
    }
    return Array.from(map.values());
});

const messageRef = useTemplateRef<HTMLElement>('messageRef');
const emojiPickerPosition = shallowRef<'above' | 'below'>('above');

watch(
    () => props.showEmojiPicker,
    async (show) => {
        if (show && messageRef.value) {
            await nextTick();
            const rect = messageRef.value.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            emojiPickerPosition.value = rect.top < viewportHeight / 2 ? 'below' : 'above';
        }
    },
);

const { copy } = useClipboard({ legacy: true });

const handleCodeCopy = (e: MouseEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.code-block-copy');
    if (!btn) return;
    const encoded = btn.dataset.code;
    if (!encoded) return;
    const tmp = document.createElement('textarea');
    tmp.innerHTML = encoded;
    copy(tmp.value);
    const original = btn.innerHTML;
    btn.innerHTML = checkIcon;
    btn.classList.add('copied');
    setTimeout(() => {
        btn.innerHTML = original;
        btn.classList.remove('copied');
    }, 2000);
};

useEventListener(messageRef, 'click', handleCodeCopy);

const handleEditKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        emit('saveEdit');
    }
    if (e.key === 'Escape') {
        emit('cancelEdit');
    }
};

const extractYouTubeId = (url: string): string | null => {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
        /youtube\.com\/watch\?.*v=([^&\s?]+)/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
};

const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

const youtubeVideoId = computed(() => {
    const urlPattern = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[^\s]+)/;
    const match = displayContent.value.match(urlPattern);
    if (match) {
        const id = extractYouTubeId(match[1]);
        return id && YOUTUBE_ID_REGEX.test(id) ? id : null;
    }
    return null;
});

const youtubeUrl = computed(() => {
    if (!youtubeVideoId.value) return '';
    return `https://www.youtube.com/watch?v=${youtubeVideoId.value}`;
});

const youtubeEmbedUrl = computed(() => {
    if (!youtubeVideoId.value) return '';
    return `https://www.youtube-nocookie.com/embed/${youtubeVideoId.value}?autoplay=1&rel=0`;
});

const messageWithoutYoutubeUrl = computed(() => {
    if (!youtubeVideoId.value) return displayContent.value;
    const urlPattern = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[^\s]+)/g;
    return displayContent.value.replace(urlPattern, '').trim();
});

const isGifUrl = computed(() => {
    return (
        displayContent.value.match(/^https?:\/\/.*\.gif$/i) ||
        displayContent.value.includes('tenor.com') ||
        displayContent.value.includes('media.tenor.com')
    );
});

const renderedContent = computed(() => {
    return renderMarkdownWithMentions(displayContent.value);
});

const renderedContentWithoutYoutube = computed(() => {
    if (!messageWithoutYoutubeUrl.value) return '';
    return renderMarkdownWithMentions(messageWithoutYoutubeUrl.value);
});
</script>

<template>
    <div ref="messageRef" class="group hover:bg-accent/50 relative -mx-2 flex gap-3 rounded p-2">
        <Avatar v-if="message.user" class="size-10 shrink-0">
            <AvatarImage
                v-if="avatarStore.getAvatarUrl(message.user.id, 'small')"
                :src="avatarStore.getAvatarUrl(message.user.id, 'small')!"
                :alt="message.user.username"
            />
            <AvatarFallback class="bg-primary text-primary-foreground text-sm font-semibold">
                {{ userNamesStore.getDisplayName(message.user.id, message.user.username)[0].toUpperCase() }}
            </AvatarFallback>
        </Avatar>

        <div class="min-w-0 flex-1 overflow-hidden">
            <div class="flex items-baseline gap-2">
                <span class="text-sm font-semibold">
                    {{
                        message.user ? userNamesStore.getDisplayName(message.user.id, message.user.username) : 'Unknown'
                    }}
                </span>
                <span class="text-muted-foreground text-xs">
                    {{ formatMessageDate(message.created_at) }}
                </span>
                <EncryptionBadge :decrypt-error="message.decrypt_error" />
                <span v-if="message.is_pinned" class="text-primary/70 inline-flex items-center gap-0.5 text-xs">
                    <Pin :size="12" />
                    pinned
                </span>
                <span v-if="message.is_edited" class="text-muted-foreground text-xs italic"> (edited) </span>
            </div>

            <MessageReplyPreview
                v-if="message.reply_to"
                :username="message.reply_to.user.username"
                :is-decrypting="isReplyDecrypting"
                :content="replyDisplayContent"
            />

            <div v-if="isEditing" class="mt-1">
                <textarea
                    :value="editContent"
                    rows="2"
                    class="border-input bg-background focus:ring-ring w-full resize-none rounded border px-3 py-2 text-sm outline-none focus:ring-2"
                    @input="emit('updateEditContent', ($event.target as HTMLTextAreaElement).value)"
                    @keydown="handleEditKeydown"
                />
                <div class="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                    <span
                        >escape to
                        <button class="text-primary hover:underline" @click="emit('cancelEdit')">cancel</button></span
                    >
                    <span
                        >• enter to
                        <button class="text-primary hover:underline" @click="emit('saveEdit')">save</button></span
                    >
                </div>
            </div>

            <div v-else class="mt-1">
                <div v-if="isDecrypting" class="flex flex-col gap-1.5">
                    <Skeleton class="h-4 w-3/4" />
                    <Skeleton class="h-4 w-1/2" />
                </div>
                <div v-else-if="isGifUrl" class="w-fit overflow-hidden rounded-lg" style="min-height: 80px">
                    <img :src="displayContent" alt="GIF" class="h-auto max-w-sm" loading="lazy" />
                </div>

                <div
                    v-else-if="messageWithoutYoutubeUrl && !youtubeVideoId"
                    class="prose-chat text-sm wrap-break-word"
                    v-html="renderedContent"
                />

                <template v-else-if="youtubeVideoId">
                    <div
                        v-if="messageWithoutYoutubeUrl"
                        class="prose-chat mb-2 text-sm wrap-break-word"
                        v-html="renderedContentWithoutYoutube"
                    />
                    <MessageYoutubeEmbed :video-id="youtubeVideoId" :url="youtubeUrl" :embed-url="youtubeEmbedUrl" />
                </template>
            </div>

            <div v-if="message.decrypted_attachments?.length" class="mt-2 flex flex-wrap gap-2">
                <FileAttachment v-for="att in message.decrypted_attachments" :key="att.id" :attachment="att" />
            </div>

            <div v-if="message.reactions?.length" class="mt-1.5 flex flex-wrap gap-1">
                <button
                    v-for="group in groupedReactions"
                    :key="group.emoji"
                    v-memo="[group.emoji, group.count, group.userReacted, canReact]"
                    :disabled="!canReact"
                    class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors"
                    :class="[
                        group.userReacted
                            ? 'border-primary/50 bg-primary/10 text-primary'
                            : 'border-border bg-accent/50 text-muted-foreground hover:bg-accent',
                        !canReact && 'cursor-not-allowed opacity-60',
                    ]"
                    @click="canReact && emit('toggleReaction', group.emoji)"
                >
                    <span>{{ group.emoji }}</span>
                    <span>{{ group.count }}</span>
                </button>
            </div>

            <ThreadPreviewBadge
                v-if="showThreadButton && message.thread"
                :thread="message.thread"
                @open-thread="emit('openThread')"
            />
        </div>

        <MessageActions
            v-if="!isEditing && (canReact || canReply || canPin || canEdit || canDelete)"
            :can-react="canReact"
            :can-reply="canReply"
            :can-thread="canThread"
            :can-pin="canPin"
            :can-edit="canEdit"
            :can-delete="canDelete"
            :is-pinned="!!message.is_pinned"
            :show-emoji-picker="showEmojiPicker"
            :emoji-picker-position="emojiPickerPosition"
            @toggle-reaction="emit('toggleReaction', $event)"
            @reply="emit('reply')"
            @open-thread="emit('openThread')"
            @toggle-pin="emit('togglePin')"
            @start-edit="emit('startEdit')"
            @delete="emit('delete')"
            @toggle-emoji-picker="emit('toggleEmojiPicker')"
        />
    </div>
</template>
