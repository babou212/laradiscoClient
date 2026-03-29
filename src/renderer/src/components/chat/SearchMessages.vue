<script setup lang="ts">
import { watchDebounced, useEventListener } from '@vueuse/core';
import { Search, X, Loader2, AlertCircle, ChevronDown } from 'lucide-vue-next';
import { shallowRef, computed, watch, onMounted } from 'vue';
import { useEncryptedSearch } from '@/composables/useEncryptedSearch';

type Props = {
    conversationType: 'channel' | 'dm';
    conversationId: number;
    conversationName: string;
};

const props = defineProps<Props>();

const emit = defineEmits<{
    close: [];
    navigateToMessage: [messageId: number];
}>();

const { isSearching, searchResults, searchError, hasMore, searchInConversation, loadMoreResults, clearSearch } =
    useEncryptedSearch();

const searchQuery = shallowRef('');
const searchInput = shallowRef<HTMLInputElement | null>(null);

watch(searchQuery, (query) => {
    if (!query.trim()) clearSearch();
});

watchDebounced(
    searchQuery,
    (query) => {
        if (!query.trim()) return;
        searchInConversation(props.conversationType, props.conversationId, query);
    },
    { debounce: 400 },
);

const statusMessage = computed(() => {
    if (isSearching.value || !searchQuery.value.trim()) return '';
    if (searchError.value) return searchError.value;
    if (searchResults.value.length === 0) return 'No results found';
    return `${searchResults.value.length} result${searchResults.value.length === 1 ? '' : 's'} found`;
});

function handleLoadMore() {
    loadMoreResults(props.conversationType, props.conversationId, searchQuery.value);
}

function handleNavigate(messageId: number) {
    emit('navigateToMessage', messageId);
}

function handleClose() {
    clearSearch();
    searchQuery.value = '';
    emit('close');
}

function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        handleClose();
    }
}

useEventListener(document, 'keydown', handleKeydown);

onMounted(() => {
    searchInput.value?.focus();
});
</script>

<template>
    <Teleport to="body">
        <div class="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
            <div class="absolute inset-0 bg-black/50" @mousedown="handleClose" />

            <div
                class="border-border bg-background relative z-10 flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border shadow-2xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="search-modal-title"
            >
                <div class="border-border flex h-12 items-center gap-2 border-b px-3">
                    <Search :size="16" class="text-muted-foreground" aria-hidden="true" />
                    <span id="search-modal-title" class="text-sm font-medium">Search in {{ conversationName }}</span>
                    <button
                        class="text-muted-foreground hover:bg-muted hover:text-foreground ml-auto rounded p-1 transition-colors"
                        title="Close search (Esc)"
                        aria-label="Close search"
                        @click="handleClose"
                    >
                        <X :size="16" aria-hidden="true" />
                    </button>
                </div>

                <div class="border-border border-b p-3">
                    <div class="relative">
                        <Search
                            :size="14"
                            class="text-muted-foreground absolute top-1/2 left-2.5 -translate-y-1/2"
                            aria-hidden="true"
                        />
                        <input
                            ref="searchInput"
                            v-model="searchQuery"
                            type="text"
                            placeholder="Search messages…"
                            aria-label="Search messages"
                            class="border-border bg-muted/50 placeholder-muted-foreground focus-visible:border-primary focus-visible:bg-background w-full rounded-md border py-1.5 pr-3 pl-8 text-sm transition-colors outline-none"
                        />
                    </div>
                </div>

                <div aria-live="polite" class="sr-only">{{ statusMessage }}</div>

                <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain" :aria-busy="isSearching">
                    <div v-if="isSearching" class="flex items-center justify-center py-8">
                        <Loader2 :size="20" class="text-muted-foreground animate-spin" aria-hidden="true" />
                        <span class="text-muted-foreground ml-2 text-sm">Searching…</span>
                    </div>

                    <div v-else-if="searchError" class="flex flex-col items-center gap-2 px-4 py-8 text-center">
                        <AlertCircle :size="24" class="text-destructive" aria-hidden="true" />
                        <p class="text-destructive text-sm">{{ searchError }}</p>
                    </div>

                    <div v-else-if="!searchQuery.trim()" class="flex flex-col items-center gap-2 px-4 py-8 text-center">
                        <Search :size="32" class="text-muted-foreground/50" aria-hidden="true" />
                        <p class="text-muted-foreground text-sm">Type to search messages</p>
                        <p class="text-muted-foreground/70 text-xs">
                            Search is fully local — works offline, never leaves your device
                        </p>
                    </div>

                    <div
                        v-else-if="searchResults.length === 0 && !isSearching"
                        class="flex flex-col items-center gap-2 px-4 py-8 text-center"
                    >
                        <Search :size="32" class="text-muted-foreground/50" aria-hidden="true" />
                        <p class="text-muted-foreground text-sm">No results found</p>
                        <p class="text-muted-foreground/70 text-xs">Try different search terms</p>
                    </div>

                    <div v-else class="divide-border divide-y">
                        <button
                            v-for="result in searchResults"
                            :key="result.messageId"
                            class="hover:bg-muted/50 flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors"
                            @click="handleNavigate(result.messageId)"
                        >
                            <div class="flex items-center gap-2">
                                <span class="text-foreground text-xs font-medium">
                                    {{ result.userName || 'Unknown' }}
                                </span>
                            </div>
                            <p class="text-muted-foreground line-clamp-2 text-xs">{{ result.snippet }}</p>
                        </button>

                        <div v-if="hasMore" class="flex justify-center py-3">
                            <button
                                class="text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors"
                                @click="handleLoadMore"
                            >
                                <ChevronDown :size="14" aria-hidden="true" />
                                Load more results
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>
