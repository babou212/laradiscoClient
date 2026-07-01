<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { renderMarkdownWithMentions } from '@/lib/markdown';
import {
    isGifUrl,
    stripPreviewUrl,
    stripYoutubeUrl,
    visibleAttachments,
    youtubeEmbedUrl,
    youtubeVideoId,
    youtubeWatchUrl,
} from '@/lib/messageMedia';
import { formatMessageDate } from '@/lib/utils';
import { useUsersStore } from '@/stores/users';
import type { MessageData } from '@/types/chat';
import FileAttachment from './FileAttachment.vue';
import MessageLinkPreview from './MessageLinkPreview.vue';
import MessageYoutubeEmbed from './MessageYoutubeEmbed.vue';

const props = defineProps<{ message: MessageData }>();

const emit = defineEmits<{ jump: [] }>();

const { t } = useI18n();
const usersStore = useUsersStore();

const content = computed(() => props.message.content ?? '');

const authorName = computed(() => {
    if (props.message.deleted_author_name) return props.message.deleted_author_name;
    return props.message.user?.username || t('chat.search.unknownUser');
});

const avatarSrc = computed(() =>
    props.message.user?.id ? usersStore.avatarUrl(props.message.user.id, 'small') : null,
);

const videoId = computed(() => youtubeVideoId(content.value));
const linkPreview = computed(() => props.message.link_preview ?? null);
const attachments = computed(() => visibleAttachments(props.message.attachments, linkPreview.value));

const isGif = computed(() => isGifUrl(content.value));

const bodyWithoutYoutube = computed(() =>
    videoId.value ? renderMarkdownWithMentions(stripYoutubeUrl(content.value)) : '',
);
const bodyWithoutPreview = computed(() =>
    linkPreview.value ? renderMarkdownWithMentions(stripPreviewUrl(content.value, linkPreview.value)) : '',
);
const renderedBody = computed(() => renderMarkdownWithMentions(content.value));
</script>

<template>
    <button
        class="hover:bg-muted/50 flex w-full gap-3 px-3 py-2.5 text-left transition-colors"
        @click="emit('jump')"
    >
        <Avatar class="size-8 shrink-0">
            <AvatarImage v-if="avatarSrc" :src="avatarSrc" :alt="authorName" />
            <AvatarFallback class="bg-primary text-primary-foreground text-xs font-semibold">
                {{ authorName[0]?.toUpperCase() ?? '?' }}
            </AvatarFallback>
        </Avatar>

        <div class="min-w-0 flex-1 overflow-hidden">
            <div class="flex items-baseline gap-2">
                <span class="text-foreground text-sm font-semibold">{{ authorName }}</span>
                <span class="text-muted-foreground text-xs">{{ formatMessageDate(message.created_at) }}</span>
            </div>

            <div class="mt-0.5">
                <div v-if="isGif" class="w-fit overflow-hidden rounded-lg">
                    <img :src="content" alt="GIF" class="h-auto max-w-xs" loading="lazy" />
                </div>

                <template v-else-if="videoId">
                    <div
                        v-if="bodyWithoutYoutube"
                        class="prose-chat mb-2 text-sm wrap-break-word"
                        v-html="bodyWithoutYoutube"
                    />
                    <MessageYoutubeEmbed
                        :video-id="videoId"
                        :url="youtubeWatchUrl(videoId)"
                        :embed-url="youtubeEmbedUrl(videoId)"
                    />
                </template>

                <template v-else-if="linkPreview">
                    <div
                        v-if="bodyWithoutPreview"
                        class="prose-chat mb-2 text-sm wrap-break-word"
                        v-html="bodyWithoutPreview"
                    />
                    <MessageLinkPreview :link-preview="linkPreview" />
                </template>

                <div v-else class="prose-chat text-sm wrap-break-word" v-html="renderedBody" />
            </div>

            <div v-if="attachments.length" class="mt-2 flex flex-wrap gap-2">
                <FileAttachment v-for="att in attachments" :key="att.id" :attachment="att" />
            </div>
        </div>
    </button>
</template>
