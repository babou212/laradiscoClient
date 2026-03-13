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
        <div class="relative z-10 flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <!-- Header -->
        <div class="flex h-12 items-center gap-2 border-b border-border px-3">
            <Search :size="16" class="text-muted-foreground" />
            <span class="text-sm font-medium">Search in {{ conversationName }}</span>
            <button
                class="ml-auto rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Close search (Esc)"
                @click="handleClose"
            >
                <X :size="16" />
            </button>
        </div>

        <!-- Search Input -->
        <div class="border-b border-border p-3">
            <div class="relative">
                <Search :size="14" class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                    ref="searchInput"
                    v-model="searchQuery"
                    type="text"
                    placeholder="Search messages…"
                    class="w-full rounded-md border border-border bg-muted/50 py-1.5 pl-8 pr-3 text-sm placeholder-muted-foreground outline-none transition-colors focus:border-primary focus:bg-background"
                />
            </div>
        </div>

        <!-- Results Area -->
        <div class="min-h-0 flex-1 overflow-y-auto">
            <!-- Loading State -->
            <div v-if="isSearching" class="flex items-center justify-center py-8">
                <Loader2 :size="20" class="animate-spin text-muted-foreground" />
                <span class="ml-2 text-sm text-muted-foreground">Searching…</span>
            </div>

            <!-- Error State -->
            <div v-else-if="searchError" class="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <AlertCircle :size="24" class="text-destructive" />
                <p class="text-sm text-destructive">{{ searchError }}</p>
            </div>

            <!-- Empty State (no query) -->
            <div v-else-if="!searchQuery.trim()" class="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <Search :size="32" class="text-muted-foreground/50" />
                <p class="text-sm text-muted-foreground">Type to search messages</p>
                <p class="text-xs text-muted-foreground/70">
                    Search uses encrypted tokens — the server never sees your query
                </p>
            </div>

            <!-- No Results -->
            <div
                v-else-if="searchResults.length === 0 && !isSearching"
                class="flex flex-col items-center gap-2 px-4 py-8 text-center"
            >
                <Search :size="32" class="text-muted-foreground/50" />
                <p class="text-sm text-muted-foreground">No results found</p>
                <p class="text-xs text-muted-foreground/70">
                    Try different search terms
                </p>
            </div>

            <!-- Results List -->
            <div v-else class="divide-y divide-border">
                <button
                    v-for="result in searchResults"
                    :key="result.id"
                    class="flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
                    @click="handleNavigate(result.id)"
                >
                    <div class="flex items-center gap-2">
                        <span class="text-xs font-medium text-foreground">
                            {{ result.user?.username ?? 'Unknown' }}
                        </span>
                        <span class="text-xs text-muted-foreground">
                            {{ formatTimestamp(result.created_at) }}
                        </span>
                    </div>
                    <p
                        v-if="!result.decrypt_error"
                        class="line-clamp-2 text-xs text-muted-foreground"
                    >
                        {{ getDisplayContent(result) }}
                    </p>
                    <p v-else class="text-xs italic text-destructive/70">
                        Could not decrypt message
                    </p>
                </button>

                <!-- Load More -->
                <div v-if="hasMore" class="flex justify-center py-3">
                    <button
                        class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
