<script setup lang="ts">
import DOMPurify from 'dompurify';
import { CornerDownRight, Pencil, SmilePlus, Trash2 } from 'lucide-vue-next';
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { formatMessageDate } from '@/lib/utils';
import type { MessageData, MessageReaction } from '@/types/chat';
import EmojiPicker from './EmojiPicker.vue';

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

const isOwnMessage = computed(
    () => props.message.user.id === currentUser.value?.id,
);
const canEdit = computed(() => isOwnMessage.value);
const canDelete = computed(() => isOwnMessage.value || props.canManageMessages);
const canReact = computed(() => props.canAddReactions !== false);
const canReply = computed(() => props.canSendMessages !== false);

const groupedReactions = computed(() => {
    const map = new Map<
        string,
        { emoji: string; count: number; userReacted: boolean }
    >();
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
    const urlPattern =
        /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[^\s]+)/;
    const match = props.message.content.match(urlPattern);
    if (match) {
        const id = extractYouTubeId(match[1]);
        return id && YOUTUBE_ID_REGEX.test(id) ? id : null;
    }
    return null;
});

const messageWithoutYoutubeUrl = computed(() => {
    if (!youtubeVideoId.value) return props.message.content;
    const urlPattern =
        /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[^\s]+)/g;
    return props.message.content.replace(urlPattern, '').trim();
});

const isGifUrl = computed(() => {
    return (
        props.message.content.match(/^https?:\/\/.*\.gif$/i) ||
        props.message.content.includes('tenor.com') ||
        props.message.content.includes('media.tenor.com')
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
    return parseMentions(props.message.content);
});

const renderedContentWithoutYoutube = computed(() => {
    if (!messageWithoutYoutubeUrl.value) return '';
    return parseMentions(messageWithoutYoutubeUrl.value);
});
</script>

<template>
    <div class="group relative -mx-2 flex gap-3 rounded p-2 hover:bg-accent/50">
        <div
            class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
        >
            {{ message.user.username[0].toUpperCase() }}
        </div>

        <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2">
                <span class="text-sm font-semibold">
                    {{ message.user.username }}
                </span>
                <span class="text-xs text-muted-foreground">
                    {{ formatMessageDate(message.created_at) }}
                </span>
                <span
                    v-if="message.is_edited"
                    class="text-xs text-muted-foreground italic"
                >
                    (edited)
                </span>
            </div>

            <div
                v-if="message.reply_to"
                class="mt-1 flex items-start gap-1.5 rounded border-l-2 border-primary/50 bg-accent/30 px-2 py-1.5 text-xs"
            >
                <CornerDownRight
                    :size="14"
                    class="mt-0.5 shrink-0 text-muted-foreground"
                />
                <div class="min-w-0 flex-1">
                    <span class="font-medium text-primary">
                        {{ message.reply_to.user.username }}
                    </span>
                    <span class="block truncate text-muted-foreground">
                        {{ message.reply_to.content.substring(0, 100)
                        }}{{
                            message.reply_to.content.length > 100 ? '...' : ''
                        }}
                    </span>
                </div>
            </div>

            <div v-if="isEditing" class="mt-1">
                <textarea
                    :value="editContent"
                    rows="2"
                    class="w-full resize-none rounded border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                    @input="
                        emit(
                            'updateEditContent',
                            ($event.target as HTMLTextAreaElement).value,
                        )
                    "
                    @keydown="handleEditKeydown"
                />
                <div
                    class="mt-1 flex items-center gap-2 text-xs text-muted-foreground"
                >
                    <span
                        >escape to
                        <button
                            class="text-primary hover:underline"
                            @click="emit('cancelEdit')"
                        >
                            cancel
                        </button></span
                    >
                    <span
                        >• enter to
                        <button
                            class="text-primary hover:underline"
                            @click="emit('saveEdit')"
                        >
                            save
                        </button></span
                    >
                </div>
            </div>

            <div v-else class="mt-1">
                <div
                    v-if="isGifUrl"
                    class="max-w-sm overflow-hidden rounded-lg"
                >
                    <img
                        :src="message.content"
                        alt="GIF"
                        class="h-auto w-full"
                        loading="lazy"
                    />
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
                    <div class="mt-2 max-w-md overflow-hidden rounded-lg">
                        <iframe
                            :src="`https://www.youtube.com/embed/${youtubeVideoId}`"
                            class="aspect-video w-full"
                            frameborder="0"
                            sandbox="allow-scripts allow-same-origin allow-popups"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture;"
                            allowfullscreen
                            referrerpolicy="no-referrer"
                        />
                    </div>
                </template>
            </div>

            <div
                v-if="message.reactions?.length"
                class="mt-1.5 flex flex-wrap gap-1"
            >
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
            class="absolute -top-3 right-2 hidden gap-0.5 rounded border border-border bg-background p-0.5 shadow-sm group-hover:flex"
        >
            <button
                v-if="canReact"
                data-reaction-button
                class="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Add reaction"
                @click.stop="emit('toggleEmojiPicker')"
            >
                <SmilePlus :size="16" />
            </button>
            <button
                v-if="canReply"
                class="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Reply"
                @click="emit('reply')"
            >
                <CornerDownRight :size="16" />
            </button>
            <button
                v-if="canEdit"
                class="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Edit message"
                @click="emit('startEdit')"
            >
                <Pencil :size="16" />
            </button>
            <button
                v-if="canDelete"
                class="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
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
