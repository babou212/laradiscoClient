<script setup lang="ts">
import { watchDebounced } from '@vueuse/core';
import { Search, X, Loader2 } from 'lucide-vue-next';
import { computed, nextTick, onMounted, shallowRef, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import type { TenorGif } from '@/types/chat';

const emit = defineEmits<{
    select: [gifUrl: string];
}>();

const { t } = useI18n();

const TENOR_API_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ';
const searchQuery = shallowRef('');
const gifs = shallowRef<TenorGif[]>([]);
const loading = shallowRef(false);
const loadingMore = shallowRef(false);
const selectedCategory = shallowRef<string>('trending');
const nextCursor = shallowRef<string>('');
const searchInputRef = useTemplateRef<HTMLInputElement>('searchInputRef');

watchDebounced(
    searchQuery,
    (val) => {
        if (!val.trim()) return;
        selectedCategory.value = '';
        fetchGifs(val.trim());
    },
    { debounce: 350 },
);

const categories = computed(() => [
    { id: 'excited', label: t('chat.gifs.categories.excited') },
    { id: 'happy', label: t('chat.gifs.categories.happy') },
    { id: 'sad', label: t('chat.gifs.categories.sad') },
    { id: 'love', label: t('chat.gifs.categories.love') },
    { id: 'angry', label: t('chat.gifs.categories.angry') },
    { id: 'laugh', label: t('chat.gifs.categories.laugh') },
    { id: 'dance', label: t('chat.gifs.categories.dance') },
    { id: 'thumbs up', label: t('chat.gifs.categories.thumbsUp') },
    { id: 'facepalm', label: t('chat.gifs.categories.facepalm') },
]);

const fetchGifs = async (query?: string, append = false) => {
    if (append) {
        loadingMore.value = true;
    } else {
        loading.value = true;
        gifs.value = [];
        nextCursor.value = '';
    }

    try {
        const pos = append && nextCursor.value ? `&pos=${nextCursor.value}` : '';
        const endpoint = query
            ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_API_KEY}&limit=30&media_filter=tinygif,gif${pos}`
            : `https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&limit=30&media_filter=tinygif,gif${pos}`;

        const response = await fetch(endpoint);
        const data = await response.json();
        const results = data.results || [];
        nextCursor.value = data.next || '';

        if (append) {
            gifs.value = [...gifs.value, ...results];
        } else {
            gifs.value = results;
        }
    } catch (error) {
        if (import.meta.env.DEV) {
            console.error('Error fetching GIFs:', error);
        }
        if (!append) {
            gifs.value = [];
        }
    } finally {
        loading.value = false;
        loadingMore.value = false;
    }
};

const loadMore = () => {
    if (loadingMore.value || !nextCursor.value) return;
    const query =
        searchQuery.value.trim() || (selectedCategory.value !== 'trending' ? selectedCategory.value : undefined);
    fetchGifs(query, true);
};

const onScroll = (event: Event) => {
    const el = event.target as HTMLElement;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
        loadMore();
    }
};

const clearSearch = () => {
    searchQuery.value = '';
    selectedCategory.value = 'trending';
    fetchGifs();
    searchInputRef.value?.focus();
};

const selectCategory = (categoryId: string) => {
    selectedCategory.value = categoryId;
    searchQuery.value = '';
    if (categoryId === 'trending') {
        fetchGifs();
    } else {
        fetchGifs(categoryId);
    }
};

const selectGif = (gif: TenorGif) => {
    const gifUrl = gif.media_formats?.gif?.url || gif.media_formats?.tinygif?.url;
    if (gifUrl) {
        emit('select', gifUrl);
    }
};

onMounted(() => {
    fetchGifs();
    nextTick(() => searchInputRef.value?.focus());
});
</script>

<template>
    <div class="border-border bg-background flex h-[450px] w-[400px] flex-col rounded-lg border shadow-lg">
        <div class="border-border border-b p-3">
            <div class="relative">
                <Search :size="16" class="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2" />
                <input
                    ref="searchInputRef"
                    v-model="searchQuery"
                    type="text"
                    :placeholder="t('chat.gifs.searchPlaceholder')"
                    class="border-input bg-background focus:ring-ring w-full rounded-md border py-2 pr-9 pl-9 text-sm outline-none focus:ring-2"
                />
                <button
                    v-if="searchQuery"
                    class="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 transition-colors"
                    @click="clearSearch"
                >
                    <X :size="14" />
                </button>
            </div>
        </div>

        <div class="scrollbar-thin border-border flex gap-1.5 overflow-x-auto border-b px-3 py-2">
            <button
                v-for="category in categories"
                :key="category.id"
                class="shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors"
                :class="
                    selectedCategory === category.id
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-accent text-accent-foreground hover:bg-accent/80'
                "
                @click="selectCategory(category.id)"
            >
                {{ category.label }}
            </button>
        </div>

        <div class="scrollbar-thin flex-1 overflow-y-auto p-2" @scroll="onScroll">
            <div v-if="loading" class="columns-2 gap-2">
                <div
                    v-for="i in 8"
                    :key="i"
                    class="bg-accent mb-2 animate-pulse break-inside-avoid rounded-lg"
                    :style="{ height: `${80 + (i % 3) * 40}px` }"
                />
            </div>

            <div v-else-if="gifs.length === 0" class="flex h-full flex-col items-center justify-center gap-2">
                <Search :size="32" class="text-muted-foreground/50" />
                <div class="text-muted-foreground text-sm">{{ t('chat.gifs.noResults') }}</div>
            </div>

            <div v-else class="columns-2 gap-2">
                <button
                    v-for="gif in gifs"
                    :key="gif.id"
                    class="bg-accent hover:ring-primary group mb-2 block w-full break-inside-avoid overflow-hidden rounded-lg transition-all hover:ring-2"
                    @click="selectGif(gif)"
                >
                    <img
                        :src="gif.media_formats?.tinygif?.url"
                        :alt="gif.content_description"
                        class="w-full object-cover transition-transform duration-200 group-hover:scale-105"
                        loading="lazy"
                    />
                </button>

                <div v-if="loadingMore" class="col-span-2 flex justify-center py-3">
                    <Loader2 :size="20" class="text-muted-foreground animate-spin" />
                </div>
            </div>
        </div>
    </div>
</template>
