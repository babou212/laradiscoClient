<script setup lang="ts">
import DOMPurify from 'dompurify';
import { CornerDownRight, ExternalLink, Pencil, Play, SmilePlus, Trash2 } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import EmojiPicker from './EmojiPicker.vue';
import EncryptionBadge from '@/components/e2ee/EncryptionBadge.vue';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMessageDate } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth';
import type { MessageData } from '@/types/chat';

interface Props {
    message: MessageData;
    isEditing: boolean;
    editContent: string;
    showEmojiPicker: boolean;
    canManageMessages?: boolean;
    canAddReactions?: boolean;
    canSendMessages?: boolean;
}

interface Emits {
    (e: 'startEdit'): void;
    (e: 'cancelEdit'): void;
    (e: 'saveEdit'): void;
    (e: 'delete'): void;
    (e: 'reply'): void;
    (e: 'toggleReaction', emoji: string): void;
    (e: 'toggleEmojiPicker'): void;
    (e: 'updateEditContent', content: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const authStore = useAuthStore();
const currentUser = computed(() => authStore.user);

const isOwnMessage = computed(() => props.message.user.id === currentUser.value?.id);
const canEdit = computed(() => isOwnMessage.value);
const canDelete = computed(() => isOwnMessage.value || props.canManageMessages);
const canReact = computed(() => props.canAddReactions !== false);
const canReply = computed(() => props.canSendMessages !== false);

const isDecrypting = computed(() => {
    return props.message.is_encrypted && !props.message.decrypt_error && !props.message.decrypted_content;
});

const displayContent = computed(() => {
    if (props.message.is_encrypted) {
        if (props.message.decrypt_error) return '[Unable to decrypt this message]';
        return props.message.decrypted_content ?? '';
    }
    return props.message.content;
});

const isReplyDecrypting = computed(() => {
    if (!props.message.reply_to) return false;
    const reply = props.message.reply_to;
    return reply.is_encrypted && !reply.decrypt_error && !reply.decrypted_content;
});

const replyDisplayContent = computed(() => {
    if (!props.message.reply_to) return '';
    const reply = props.message.reply_to;
    if (reply.is_encrypted) {
        if (reply.decrypt_error) return '[Unable to decrypt]';
        return reply.decrypted_content ?? '';
    }
    return reply.content;
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

const youtubeActive = ref(false);

const playYouTube = () => {
    youtubeActive.value = true;
};

const openYouTube = () => {
    if (youtubeUrl.value) {
        window.open(youtubeUrl.value, '_blank');
    }
};

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

const escapeHtml = (text: string): string =>
    text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const parseMentions = (text: string): string => {
    const escaped = escapeHtml(text);

    const html = escaped.replace(/@(everyone|here|\w+)/g, (match, name) => {
        const isSpecial = name === 'everyone' || name === 'here';
        const classes = isSpecial
            ? 'mention mention-special cursor-pointer rounded bg-primary/20 px-1 py-0.5 font-medium text-primary hover:bg-primary/30'
            : 'mention mention-user cursor-pointer rounded bg-primary/20 px-1 py-0.5 font-medium text-primary hover:bg-primary/30';
        const safeName = escapeHtml(name);
        return `<span class="${classes}" data-mention="${safeName}">${escapeHtml(match)}</span>`;
    });

    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['span'],
        ALLOWED_ATTR: ['class', 'data-mention'],
    });
};

const renderedContent = computed(() => {
    return parseMentions(displayContent.value);
});

const renderedContentWithoutYoutube = computed(() => {
    if (!messageWithoutYoutubeUrl.value) return '';
    return parseMentions(messageWithoutYoutubeUrl.value);
});
</script>

<template>
    <div class="group hover:bg-accent/50 relative -mx-2 flex gap-3 rounded p-2">
        <div
            class="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
        >
            {{ message.user.username[0].toUpperCase() }}
        </div>

        <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2">
                <span class="text-sm font-semibold">
                    {{ message.user.username }}
                </span>
                <span class="text-muted-foreground text-xs">
                    {{ formatMessageDate(message.created_at) }}
                </span>
                <EncryptionBadge :is-encrypted="message.is_encrypted" :decrypt-error="message.decrypt_error" />
                <span v-if="message.is_edited" class="text-muted-foreground text-xs italic"> (edited) </span>
            </div>

            <div
                v-if="message.reply_to"
                class="border-primary/50 bg-accent/30 mt-1 flex items-start gap-1.5 rounded border-l-2 px-2 py-1.5 text-xs"
            >
                <CornerDownRight :size="14" class="text-muted-foreground mt-0.5 shrink-0" />
                <div class="min-w-0 flex-1">
                    <span class="text-primary font-medium">
                        {{ message.reply_to.user.username }}
                    </span>
                    <Skeleton v-if="isReplyDecrypting" class="h-3 w-40" />
                    <span v-else class="text-muted-foreground block truncate">
                        {{ replyDisplayContent.substring(0, 100) }}{{ replyDisplayContent.length > 100 ? '...' : '' }}
                    </span>
                </div>
            </div>

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
                <div v-else-if="isGifUrl" class="max-w-sm overflow-hidden rounded-lg">
                    <img :src="displayContent" alt="GIF" class="h-auto w-full" loading="lazy" />
                </div>

                <div
                    v-else-if="messageWithoutYoutubeUrl && !youtubeVideoId"
                    class="text-sm wrap-break-word whitespace-pre-wrap"
                    v-html="renderedContent"
                />

                <template v-else-if="youtubeVideoId">
                    <div
                        v-if="messageWithoutYoutubeUrl"
                        class="mb-2 text-sm wrap-break-word whitespace-pre-wrap"
                        v-html="renderedContentWithoutYoutube"
                    />
                    <div class="border-border mt-2 max-w-md overflow-hidden rounded-lg border bg-black">
                        <div class="relative aspect-video w-full">
                            <iframe
                                v-if="youtubeActive"
                                :src="youtubeEmbedUrl"
                                class="h-full w-full border-none"
                                allow="
                                    accelerometer;
                                    autoplay;
                                    clipboard-write;
                                    encrypted-media;
                                    gyroscope;
                                    picture-in-picture;
                                "
                                allowfullscreen
                            />
                            <template v-else>
                                <img
                                    :src="`https://img.youtube.com/vi/${youtubeVideoId}/hqdefault.jpg`"
                                    alt="YouTube video"
                                    class="h-full w-full object-cover"
                                    loading="lazy"
                                />
                                <button
                                    class="group/yt absolute inset-0 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/10 focus:outline-none"
                                    @click="playYouTube"
                                >
                                    <div
                                        class="flex size-14 items-center justify-center rounded-full bg-red-600 shadow-lg transition-transform group-hover/yt:scale-110"
                                    >
                                        <Play :size="28" class="ml-1 fill-white text-white" />
                                    </div>
                                </button>
                            </template>
                        </div>
                        <button
                            class="text-muted-foreground hover:text-foreground flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs"
                            @click="openYouTube"
                        >
                            <ExternalLink :size="12" />
                            <span>Open in browser</span>
                        </button>
                    </div>
                </template>
            </div>

            <div v-if="message.reactions?.length" class="mt-1.5 flex flex-wrap gap-1">
                <button
                    v-for="group in groupedReactions"
                    :key="group.emoji"
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
        </div>

        <div
            v-if="!isEditing && (canReact || canReply || canEdit || canDelete)"
            class="border-border bg-background absolute -top-3 right-2 hidden gap-0.5 rounded border p-0.5 shadow-sm group-hover:flex"
        >
            <button
                v-if="canReact"
                data-reaction-button
                class="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
                title="Add reaction"
                @click.stop="emit('toggleEmojiPicker')"
            >
                <SmilePlus :size="16" />
            </button>
            <button
                v-if="canReply"
                class="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
                title="Reply"
                @click="emit('reply')"
            >
                <CornerDownRight :size="16" />
            </button>
            <button
                v-if="canEdit"
                class="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
                title="Edit message"
                @click="emit('startEdit')"
            >
                <Pencil :size="16" />
            </button>
            <button
                v-if="canDelete"
                class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded p-1 transition-colors"
                title="Delete message"
                @click="emit('delete')"
            >
                <Trash2 :size="16" />
            </button>
        </div>

        <EmojiPicker
            v-if="showEmojiPicker"
            class="emoji-picker-container absolute -top-3 right-20 z-10"
            @select="emit('toggleReaction', $event)"
        />
    </div>
</template>
