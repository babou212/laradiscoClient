<script setup lang="ts">
import { ExternalLink, Play } from 'lucide-vue-next';
import { shallowRef } from 'vue';

const props = defineProps<{
    videoId: string;
    url: string;
    embedUrl: string;
}>();

const active = shallowRef(false);

const play = () => {
    active.value = true;
};

const openExternal = () => {
    window.open(props.url, '_blank');
};
</script>

<template>
    <div class="border-border mt-2 max-w-md overflow-hidden rounded-lg border bg-black">
        <div class="relative aspect-video w-full">
            <iframe
                v-if="active"
                :src="embedUrl"
                class="h-full w-full border-none"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
            />
            <template v-else>
                <img
                    :src="`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`"
                    alt="YouTube video"
                    class="h-full w-full object-cover"
                    loading="lazy"
                />
                <button
                    class="group/yt absolute inset-0 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/10 focus:outline-none"
                    @click="play"
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
            @click="openExternal"
        >
            <ExternalLink :size="12" />
            <span>Open in browser</span>
        </button>
    </div>
</template>
