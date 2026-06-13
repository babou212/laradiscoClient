<script setup lang="ts">
import { ExternalLink } from 'lucide-vue-next';
import { computed, shallowRef, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import { getAttachmentDownloadUrl } from '@/api/attachments';
import type { LinkPreviewData } from '@/types/chat';

const { t } = useI18n();

const props = defineProps<{
    linkPreview: LinkPreviewData;
}>();

const emit = defineEmits<{
    (e: 'image-loaded'): void;
}>();

const imageUrl = shallowRef<string | null>(null);
const imageLoaded = shallowRef(false);
const imageErrored = shallowRef(false);

const hostname = computed(() => {
    try {
        return new URL(props.linkPreview.url).hostname.replace(/^www\./, '');
    } catch {
        return props.linkPreview.url;
    }
});

const displaySite = computed(() => props.linkPreview.site_name || hostname.value);

const displayImageUrl = computed(() => {
    if (imageErrored.value) return null;
    if (imageUrl.value) return imageUrl.value;
    const fallback = props.linkPreview.image_url;
    if (!fallback) return null;
    return /^https:\/\//i.test(fallback) ? fallback : null;
});

const hasImage = computed(
    () => !imageErrored.value && (Boolean(props.linkPreview.image) || Boolean(displayImageUrl.value)),
);

const aspectRatioStyle = computed(() => {
    const w = props.linkPreview.image_width;
    const h = props.linkPreview.image_height;
    if (w && h && w > 0 && h > 0) {
        return { aspectRatio: `${w} / ${h}` };
    }
    return { aspectRatio: '16 / 9' };
});

function onImageLoad() {
    imageLoaded.value = true;
    emit('image-loaded');
}

function onImageError() {
    // The downloaded attachment URL failed — fall back to the remote og:image
    // once; if that also fails (or there is none), hide the image area instead
    // of leaving a permanent loading shimmer.
    const remote = props.linkPreview.image_url;
    if (imageUrl.value && remote && /^https:\/\//i.test(remote)) {
        imageUrl.value = null;
        return;
    }
    imageErrored.value = true;
    emit('image-loaded');
}

watchEffect(async () => {
    const image = props.linkPreview.image;
    if (!image) return;

    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 1500;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const { download_url } = await getAttachmentDownloadUrl(image.id);
            imageUrl.value = download_url;
            return;
        } catch (err) {
            if (attempt < MAX_RETRIES - 1) {
                await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            } else {
                console.warn('[MessageLinkPreview] image load failed after retries:', err);
            }
        }
    }
});

const openExternal = () => {
    window.open(props.linkPreview.url, '_blank');
};
</script>

<template>
    <div
        class="border-border bg-muted/30 border-l-primary/60 mt-2 max-w-md overflow-hidden rounded-lg border border-l-4"
    >
        <div class="flex flex-col gap-1 p-3">
            <div class="text-muted-foreground truncate text-xs">{{ displaySite }}</div>
            <button
                class="hover:text-primary text-left text-sm font-semibold break-words hover:underline"
                @click="openExternal"
            >
                {{ linkPreview.title }}
            </button>
            <div v-if="linkPreview.description" class="text-muted-foreground line-clamp-2 text-xs break-words">
                {{ linkPreview.description }}
            </div>
            <button
                class="text-muted-foreground hover:text-foreground mt-1 inline-flex items-center gap-1 self-start text-[11px]"
                @click="openExternal"
            >
                <ExternalLink :size="10" />
                <span>{{ t('chat.linkPreview.openInBrowser') }}</span>
            </button>
        </div>
        <div v-if="hasImage" class="bg-muted/60 relative max-h-64 w-full overflow-hidden" :style="aspectRatioStyle">
            <div
                v-if="!imageLoaded"
                class="from-muted/40 via-muted/70 to-muted/40 absolute inset-0 animate-pulse bg-gradient-to-r"
                aria-hidden="true"
            />
            <img
                v-if="displayImageUrl"
                :src="displayImageUrl"
                alt=""
                class="absolute inset-0 h-full w-full cursor-pointer object-cover transition-opacity duration-200"
                :class="imageLoaded ? 'opacity-100' : 'opacity-0'"
                loading="lazy"
                referrerpolicy="no-referrer"
                @click="openExternal"
                @load="onImageLoad"
                @error="onImageError"
            />
        </div>
    </div>
</template>
