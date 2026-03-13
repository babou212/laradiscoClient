<script setup lang="ts">
import { Search, X, Loader2, AlertCircle, ChevronDown } from 'lucide-vue-next';
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useEncryptedSearch } from '@/composables/useEncryptedSearch';
import type { MessageData } from '@/types/chat';

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

const searchQuery = ref('');
const searchInput = ref<HTMLInputElement | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(searchQuery, (query) => {
    if (debounceTimer) clearTimeout(debounceTimer);

    if (!query.trim()) {
        clearSearch();
        return;
    }

    debounceTimer = setTimeout(() => {
        searchInConversation(props.conversationType, props.conversationId, query);
    }, 400);
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

function getDisplayContent(message: MessageData): string {
    const content = message.decrypted_content || message.content;
    if (content.length > 200) return content.substring(0, 200) + '…';
    return content;
}

function formatTimestamp(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
        return 'Yesterday';
    } else if (days < 7) {
        return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        handleClose();
    }
}

onMounted(() => {
    searchInput.value?.focus();
    document.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    document.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
    <Teleport to="body">
        <div class="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
            <!-- Backdrop -->
            <div class="absolute inset-0 bg-black/50" @mousedown="handleClose" />

            <!-- Modal -->
            <div
                class="border-border bg-background relative z-10 flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border shadow-2xl"
            >
                <!-- Header -->
                <div class="border-border flex h-12 items-center gap-2 border-b px-3">
                    <Search :size="16" class="text-muted-foreground" />
                    <span class="text-sm font-medium">Search in {{ conversationName }}</span>
                    <button
                        class="text-muted-foreground hover:bg-muted hover:text-foreground ml-auto rounded p-1 transition-colors"
                        title="Close search (Esc)"
                        @click="handleClose"
                    >
                        <X :size="16" />
                    </button>
                </div>

                <!-- Search Input -->
                <div class="border-border border-b p-3">
                    <div class="relative">
                        <Search :size="14" class="text-muted-foreground absolute top-1/2 left-2.5 -translate-y-1/2" />
                        <input
                            ref="searchInput"
                            v-model="searchQuery"
                            type="text"
                            placeholder="Search messages…"
                            class="border-border bg-muted/50 placeholder-muted-foreground focus:border-primary focus:bg-background w-full rounded-md border py-1.5 pr-3 pl-8 text-sm transition-colors outline-none"
                        />
                    </div>
                </div>

                <!-- Results Area -->
                <div class="min-h-0 flex-1 overflow-y-auto">
                    <!-- Loading State -->
                    <div v-if="isSearching" class="flex items-center justify-center py-8">
                        <Loader2 :size="20" class="text-muted-foreground animate-spin" />
                        <span class="text-muted-foreground ml-2 text-sm">Searching…</span>
                    </div>

                    <!-- Error State -->
                    <div v-else-if="searchError" class="flex flex-col items-center gap-2 px-4 py-8 text-center">
                        <AlertCircle :size="24" class="text-destructive" />
                        <p class="text-destructive text-sm">{{ searchError }}</p>
                    </div>

                    <!-- Empty State (no query) -->
                    <div v-else-if="!searchQuery.trim()" class="flex flex-col items-center gap-2 px-4 py-8 text-center">
                        <Search :size="32" class="text-muted-foreground/50" />
                        <p class="text-muted-foreground text-sm">Type to search messages</p>
                        <p class="text-muted-foreground/70 text-xs">
                            Search uses encrypted tokens — the server never sees your query
                        </p>
                    </div>

                    <!-- No Results -->
                    <div
                        v-else-if="searchResults.length === 0 && !isSearching"
                        class="flex flex-col items-center gap-2 px-4 py-8 text-center"
                    >
                        <Search :size="32" class="text-muted-foreground/50" />
                        <p class="text-muted-foreground text-sm">No results found</p>
                        <p class="text-muted-foreground/70 text-xs">Try different search terms</p>
                    </div>

                    <!-- Results List -->
                    <div v-else class="divide-border divide-y">
                        <button
                            v-for="result in searchResults"
                            :key="result.id"
                            class="hover:bg-muted/50 flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors"
                            @click="handleNavigate(result.id)"
                        >
                            <div class="flex items-center gap-2">
                                <span class="text-foreground text-xs font-medium">
                                    {{ result.user?.username ?? 'Unknown' }}
                                </span>
                                <span class="text-muted-foreground text-xs">
                                    {{ formatTimestamp(result.created_at) }}
                                </span>
                            </div>
                            <p v-if="!result.decrypt_error" class="text-muted-foreground line-clamp-2 text-xs">
                                {{ getDisplayContent(result) }}
                            </p>
                            <p v-else class="text-destructive/70 text-xs italic">Could not decrypt message</p>
                        </button>

                        <!-- Load More -->
                        <div v-if="hasMore" class="flex justify-center py-3">
                            <button
                                class="text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors"
                                @click="handleLoadMore"
                            >
                                <ChevronDown :size="14" />
                                Load more results
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </Teleport>
</template>
