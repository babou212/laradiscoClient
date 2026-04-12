<script setup lang="ts">
import { Download, File, Image, Loader2, X } from 'lucide-vue-next';
import { computed, onBeforeUnmount, shallowRef, watch, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import AudioPlayer from './AudioPlayer.vue';
import PdfViewer from './PdfViewer.vue';
import VideoPlayer from './VideoPlayer.vue';
import { getAttachmentDownloadUrl } from '@/api/attachments';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { decryptAttachment } from '@/lib/decrypt-attachment';
import type { EncryptedAttachmentMeta } from '@/types/chat';

const props = defineProps<{
    attachment: EncryptedAttachmentMeta;
}>();

const { t } = useI18n();

const thumbnailUrl = shallowRef<string | null>(props.attachment.thumbnail_data_url ?? null);
const thumbnailLoading = shallowRef(false);
const downloading = shallowRef(false);
const lightboxOpen = shallowRef(false);
const fullImageUrl = shallowRef<string | null>(null);
const fullImageLoading = shallowRef(false);

const isImage = computed(() => props.attachment.mime_type.startsWith('image/'));
const isAudio = computed(() => props.attachment.mime_type.startsWith('audio/'));
const isVideo = computed(() => props.attachment.mime_type.startsWith('video/'));
const isPdf = computed(() => props.attachment.mime_type === 'application/pdf');

function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') lightboxOpen.value = false;
}

watchEffect((onCleanup) => {
    if (!lightboxOpen.value) return;
    window.addEventListener('keydown', onKeydown);
    onCleanup(() => window.removeEventListener('keydown', onKeydown));
});

onBeforeUnmount(() => {
    if (thumbnailUrl.value && thumbnailUrl.value.startsWith('blob:')) {
        URL.revokeObjectURL(thumbnailUrl.value);
    }
    if (fullImageUrl.value) {
        URL.revokeObjectURL(fullImageUrl.value);
    }
});

function onThumbnailError() {
    if (thumbnailUrl.value) {
        thumbnailUrl.value = null;
        loadThumbnail();
    }
}

async function loadThumbnail() {
    if (!props.attachment.thumbnail_key || thumbnailLoading.value || thumbnailUrl.value) return;
    thumbnailLoading.value = true;

    try {
        const { thumbnail_url } = await getAttachmentDownloadUrl(props.attachment.id);
        if (!thumbnail_url) return;

        const encryptedBuffer = await window.api.attachments.downloadBuffer(thumbnail_url);

        const decryptedBuffer = await decryptAttachment(
            encryptedBuffer,
            props.attachment.thumbnail_key!,
            props.attachment.thumbnail_iv!,
        );
        const blob = new Blob([decryptedBuffer], { type: props.attachment.mime_type });
        thumbnailUrl.value = URL.createObjectURL(blob);
    } catch (err) {
        console.error('Failed to load thumbnail:', err);
    } finally {
        thumbnailLoading.value = false;
    }
}

async function decryptFullImage(): Promise<string> {
    const { download_url } = await getAttachmentDownloadUrl(props.attachment.id);

    const encryptedBuffer = await window.api.attachments.downloadBuffer(download_url);

    const decryptedBuffer = await decryptAttachment(encryptedBuffer, props.attachment.key, props.attachment.iv);
    const blob = new Blob([decryptedBuffer], { type: props.attachment.mime_type });
    return URL.createObjectURL(blob);
}

async function openLightbox() {
    lightboxOpen.value = true;
    if (fullImageUrl.value) return;
    fullImageLoading.value = true;
    try {
        fullImageUrl.value = await decryptFullImage();
    } catch (err) {
        console.error('Failed to load full image:', err);
        lightboxOpen.value = false;
    } finally {
        fullImageLoading.value = false;
    }
}

async function downloadFile() {
    if (downloading.value) return;
    downloading.value = true;

    try {
        const url = fullImageUrl.value ?? (await decryptFullImage());

        const a = document.createElement('a');
        a.href = url;
        a.download = props.attachment.file_name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        if (!fullImageUrl.value) {
            URL.revokeObjectURL(url);
        }
    } catch (err) {
        console.error('Failed to download file:', err);
    } finally {
        downloading.value = false;
    }
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

watch(
    () => props.attachment.thumbnail_key,
    (key) => {
        if (key) loadThumbnail();
    },
    { immediate: true },
);
</script>

<template>
    <div class="inline-block max-w-xs">
        <AudioPlayer v-if="isAudio" :attachment="attachment" />

        <VideoPlayer v-else-if="isVideo" :attachment="attachment" />

        <PdfViewer v-else-if="isPdf" :attachment="attachment" />

        <div
            v-else-if="isImage && (thumbnailUrl || attachment.thumbnail_key)"
            class="bg-muted group cursor-pointer overflow-hidden rounded-lg"
            @click="openLightbox"
        >
            <div
                class="relative"
                :style="
                    attachment.thumbnail_width && attachment.thumbnail_height
                        ? {
                              aspectRatio: `${attachment.thumbnail_width}/${attachment.thumbnail_height}`,
                              maxHeight: '15rem',
                              maxWidth: `calc(15rem * ${attachment.thumbnail_width} / ${attachment.thumbnail_height})`,
                          }
                        : { aspectRatio: '16/9', maxHeight: '15rem', maxWidth: 'calc(15rem * 16 / 9)' }
                "
            >
                <img
                    v-if="thumbnailUrl"
                    :src="thumbnailUrl"
                    :alt="attachment.file_name"
                    class="h-full w-full rounded-lg object-cover"
                    @error="onThumbnailError"
                />
                <div v-else class="flex h-full w-full items-center justify-center">
                    <Loader2 :size="24" class="text-muted-foreground animate-spin" />
                </div>
            </div>
            <div class="text-muted-foreground flex items-center gap-1 px-2 py-1 text-[10px]">
                <span class="truncate">{{ attachment.file_name }}</span>
                <span class="shrink-0">{{ formatFileSize(attachment.size) }}</span>
            </div>
        </div>

        <button
            v-else-if="!isAudio && !isVideo"
            class="bg-muted hover:bg-accent/80 flex items-center gap-3 rounded-lg px-3 py-2 transition-colors"
            :disabled="downloading"
            @click="downloadFile"
        >
            <div class="bg-accent text-muted-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded">
                <Image v-if="isImage" :size="18" />
                <File v-else :size="18" />
            </div>
            <div class="min-w-0 text-left">
                <div class="text-foreground truncate text-sm font-medium">{{ attachment.file_name }}</div>
                <div class="text-muted-foreground text-xs">{{ formatFileSize(attachment.size) }}</div>
            </div>
            <Download :size="16" class="text-muted-foreground shrink-0" />
        </button>

        <Teleport to="body">
            <Transition name="lightbox">
                <div
                    v-if="lightboxOpen"
                    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
                    @click.self="lightboxOpen = false"
                >
                    <div class="relative max-h-[90vh] max-w-[90vw]">
                        <img
                            v-if="fullImageUrl"
                            :src="fullImageUrl"
                            :alt="attachment.file_name"
                            class="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
                        />
                        <div v-else class="flex h-40 w-60 items-center justify-center rounded-lg bg-black/40">
                            <Loader2 :size="32" class="animate-spin text-white" />
                        </div>

                        <div class="absolute -top-3 -right-3 flex gap-1">
                            <SimpleTooltip :content="t('chat.files.download')">
                                <button
                                    class="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                                    @click.stop="downloadFile"
                                >
                                    <Download :size="16" />
                                </button>
                            </SimpleTooltip>
                            <SimpleTooltip :content="t('chat.files.close')">
                                <button
                                    class="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                                    @click.stop="lightboxOpen = false"
                                >
                                    <X :size="16" />
                                </button>
                            </SimpleTooltip>
                        </div>

                        <div class="text-muted-foreground mt-2 text-center text-xs">
                            {{ attachment.file_name }} &middot; {{ formatFileSize(attachment.size) }}
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<style scoped>
.lightbox-enter-active,
.lightbox-leave-active {
    transition: opacity 0.2s ease;
}
.lightbox-enter-from,
.lightbox-leave-to {
    opacity: 0;
}
</style>
