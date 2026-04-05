<script setup lang="ts">
import { Download, FileText, Loader2, X } from 'lucide-vue-next';
import { onBeforeUnmount, shallowRef, watchEffect } from 'vue';
import { getAttachmentDownloadUrl } from '@/api/attachments';
import { decryptAttachment } from '@/lib/decrypt-attachment';
import type { EncryptedAttachmentMeta } from '@/types/chat';

const props = defineProps<{
    attachment: EncryptedAttachmentMeta;
}>();

const blobUrl = shallowRef<string | null>(null);
const isLoading = shallowRef(false);
const downloading = shallowRef(false);
const lightboxOpen = shallowRef(false);

watchEffect((onCleanup) => {
    if (!lightboxOpen.value) return;
    const onKeydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') lightboxOpen.value = false;
    };
    window.addEventListener('keydown', onKeydown);
    onCleanup(() => window.removeEventListener('keydown', onKeydown));
});

onBeforeUnmount(() => {
    if (blobUrl.value) {
        URL.revokeObjectURL(blobUrl.value);
    }
});

async function decryptPdf(): Promise<string> {
    const { download_url } = await getAttachmentDownloadUrl(props.attachment.id);
    const encryptedBuffer = await window.api.attachments.downloadBuffer(download_url);
    const decryptedBuffer = await decryptAttachment(encryptedBuffer, props.attachment.key, props.attachment.iv);
    const blob = new Blob([decryptedBuffer], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
}

async function openLightbox() {
    lightboxOpen.value = true;
    if (blobUrl.value) return;
    isLoading.value = true;
    try {
        blobUrl.value = await decryptPdf();
    } catch (err) {
        console.error('Failed to load PDF:', err);
        lightboxOpen.value = false;
    } finally {
        isLoading.value = false;
    }
}

async function downloadFile() {
    if (downloading.value) return;
    downloading.value = true;
    try {
        const url = blobUrl.value ?? (await decryptPdf());
        const a = document.createElement('a');
        a.href = url;
        a.download = props.attachment.file_name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (!blobUrl.value) {
            URL.revokeObjectURL(url);
        }
    } catch (err) {
        console.error('Failed to download PDF:', err);
    } finally {
        downloading.value = false;
    }
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
</script>

<template>
    <div class="inline-block max-w-xs">
        <button
            class="bg-muted hover:bg-accent/80 flex items-center gap-3 rounded-lg px-3 py-2 transition-colors"
            @click="openLightbox"
        >
            <div
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-red-500/15 text-red-500 dark:bg-red-400/15 dark:text-red-400"
            >
                <FileText :size="18" />
            </div>
            <div class="min-w-0 text-left">
                <div class="text-foreground truncate text-sm font-medium">{{ attachment.file_name }}</div>
                <div class="text-muted-foreground text-xs">{{ formatFileSize(attachment.size) }}</div>
            </div>
        </button>

        <Teleport to="body">
            <Transition name="pdf-lightbox">
                <div
                    v-if="lightboxOpen"
                    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
                    @click.self="lightboxOpen = false"
                >
                    <div class="relative flex h-[90vh] w-[90vw] max-w-4xl flex-col rounded-lg bg-black/40">
                        <div class="flex items-center justify-between px-4 py-2">
                            <div class="text-muted-foreground truncate text-sm">
                                {{ attachment.file_name }} &middot; {{ formatFileSize(attachment.size) }}
                            </div>
                            <div class="flex gap-1">
                                <button
                                    class="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                                    title="Download"
                                    @click.stop="downloadFile"
                                >
                                    <Download :size="16" />
                                </button>
                                <button
                                    class="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                                    title="Close"
                                    @click.stop="lightboxOpen = false"
                                >
                                    <X :size="16" />
                                </button>
                            </div>
                        </div>

                        <div class="min-h-0 flex-1">
                            <div v-if="isLoading" class="flex h-full items-center justify-center">
                                <Loader2 :size="32" class="animate-spin text-white" />
                            </div>
                            <iframe
                                v-else-if="blobUrl"
                                :src="blobUrl"
                                class="h-full w-full rounded-b-lg"
                                :title="attachment.file_name"
                            />
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<style scoped>
.pdf-lightbox-enter-active,
.pdf-lightbox-leave-active {
    transition: opacity 0.2s ease;
}
.pdf-lightbox-enter-from,
.pdf-lightbox-leave-to {
    opacity: 0;
}
</style>
