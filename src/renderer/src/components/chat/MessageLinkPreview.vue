<script setup lang="ts">
import { ExternalLink } from 'lucide-vue-next';
import { computed, onBeforeUnmount, shallowRef, watchEffect } from 'vue';
import { getAttachmentDownloadUrl } from '@/api/attachments';
import { decryptAttachment } from '@/lib/decrypt-attachment';
import type { LinkPreviewData } from '@/types/chat';

const props = defineProps<{
    linkPreview: LinkPreviewData;
}>();

const imageUrl = shallowRef<string | null>(null);

const hostname = computed(() => {
    try {
        return new URL(props.linkPreview.url).hostname.replace(/^www\./, '');
    } catch {
        return props.linkPreview.url;
    }
});

const displaySite = computed(() => props.linkPreview.site_name || hostname.value);

watchEffect(async () => {
    const image = props.linkPreview.image;
    if (!image) return;
    try {
        const { download_url } = await getAttachmentDownloadUrl(image.id);
        const encryptedBuffer = await window.api.attachments.downloadBuffer(download_url);
        const decryptedBuffer = await decryptAttachment(encryptedBuffer, image.key, image.iv);
        const blob = new Blob([decryptedBuffer], { type: image.mime_type });
        imageUrl.value = URL.createObjectURL(blob);
    } catch (err) {
        console.warn('[MessageLinkPreview] image decrypt failed:', err);
    }
});

onBeforeUnmount(() => {
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value);
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
                <span>Open in browser</span>
            </button>
        </div>
        <img
            v-if="imageUrl"
            :src="imageUrl"
            alt=""
            class="max-h-64 w-full cursor-pointer object-cover"
            loading="lazy"
            @click="openExternal"
        />
    </div>
</template>
