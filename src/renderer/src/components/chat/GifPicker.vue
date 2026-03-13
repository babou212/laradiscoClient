<script setup lang="ts">
import { Search } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';

interface Emits {
    (e: 'select', gifUrl: string): void;
}

const emit = defineEmits<Emits>();

const TENOR_API_KEY = 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ';
const searchQuery = ref('');
const gifs = ref<any[]>([]);
const loading = ref(false);
const selectedCategory = ref<string>('trending');

const categories = [
    { id: 'trending', label: 'Trending' },
    { id: 'excited', label: 'Excited' },
    { id: 'happy', label: 'Happy' },
    { id: 'sad', label: 'Sad' },
    { id: 'love', label: 'Love' },
    { id: 'angry', label: 'Angry' },
    { id: 'laugh', label: 'Laugh' },
    { id: 'dance', label: 'Dance' },
];

const fetchGifs = async (query?: string) => {
    loading.value = true;
    try {
        const endpoint = query
            ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_API_KEY}&limit=20`
            : `https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&limit=20`;

        const response = await fetch(endpoint);
        const data = await response.json();
        gifs.value = data.results || [];
    } catch (error) {
        if (import.meta.env.DEV) {
            console.error('Error fetching GIFs:', error);
        }
        gifs.value = [];
    } finally {
        loading.value = false;
    }
};

const searchGifs = () => {
    if (searchQuery.value.trim()) {
        selectedCategory.value = '';
        fetchGifs(searchQuery.value);
    }
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

const selectGif = (gif: any) => {
    const gifUrl = gif.media_formats?.gif?.url || gif.media_formats?.tinygif?.url;
    if (gifUrl) {
        emit('select', gifUrl);
    }
};

onMounted(() => {
    fetchGifs();
});
</script>

<template>
    <div class="border-border bg-background flex h-[450px] w-[400px] flex-col rounded-lg border shadow-lg">
        <div class="border-border border-b p-3">
            <div class="relative">
                <Search :size="16" class="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2" />
                <input
                    v-model="searchQuery"
                    type="text"
                    placeholder="Search for GIFs"
                    class="border-input bg-background focus:ring-ring w-full rounded-md border py-2 pr-3 pl-9 text-sm outline-none focus:ring-2"
                    @keydown.enter="searchGifs"
                />
            </div>
        </div>

        <div class="scrollbar-thin border-border flex gap-2 overflow-x-auto border-b p-3">
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

        <div class="flex-1 overflow-y-auto p-3">
            <div v-if="loading" class="flex h-full items-center justify-center">
                <div class="text-muted-foreground text-sm">Loading...</div>
            </div>
            <div v-else-if="gifs.length === 0" class="flex h-full items-center justify-center">
                <div class="text-muted-foreground text-sm">No GIFs found</div>
            </div>
            <div v-else class="grid grid-cols-2 gap-2">
                <button
                    v-for="gif in gifs"
                    :key="gif.id"
                    class="bg-accent hover:ring-primary relative aspect-square overflow-hidden rounded-lg transition-all hover:ring-2"
                    @click="selectGif(gif)"
                >
                    <img
                        :src="gif.media_formats?.tinygif?.url || gif.media_formats?.gif?.url"
                        :alt="gif.content_description"
                        class="h-full w-full object-cover"
                        loading="lazy"
                    />
                </button>
            </div>
        </div>
    </div>
</template>
