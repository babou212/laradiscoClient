<script setup lang="ts">
import { ArrowLeft, Plus, Search, X } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import api from '@/lib/api';
import { usePresenceStore } from '@/stores/presence';
import type { DmGroup } from '@/stores/directMessages';
import type { UserStatusType } from '@/types';

type Props = {
    dmGroups: DmGroup[];
    selectedDmGroupId?: number | null;
};

defineProps<Props>();
const emit = defineEmits<{
    selectDm: [dmGroupId: number];
    switchToChannels: [];
    startDm: [userId: number];
}>();

const presenceStore = usePresenceStore();

const showNewDmSearch = ref(false);
const searchQuery = ref('');
const searchResults = ref<Array<{ id: number; username: string; display_name: string; avatar_path: string | null }>>([]);
const isSearching = ref(false);

const getStatusColor = (userId: number): string => {
    const userStatus = presenceStore.getUserStatus(userId);
    const status = userStatus?.status || 'offline';
    switch (status) {
        case 'online':
            return 'bg-green-500';
        case 'idle':
            return 'bg-orange-500';
        case 'dnd':
            return 'bg-red-500';
        case 'offline':
        default:
            return 'bg-gray-400';
    }
};

const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
        });
    }
    if (diffInHours < 24 * 7) {
        return date.toLocaleDateString('en-US', { weekday: 'short' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const truncateMessage = (content: string, maxLength: number = 40) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
};

let searchDebounce: ReturnType<typeof setTimeout> | null = null;

const handleSearch = (query: string) => {
    searchQuery.value = query;
    if (searchDebounce) clearTimeout(searchDebounce);

    if (!query.trim()) {
        searchResults.value = [];
        return;
    }

    searchDebounce = setTimeout(async () => {
        isSearching.value = true;
        try {
            const response = await api.get('/members', { params: { search: query } });
            searchResults.value = response.data?.members ?? response.data ?? [];
        } catch {
            searchResults.value = [];
        } finally {
            isSearching.value = false;
        }
    }, 300);
};

const selectSearchUser = (userId: number) => {
    emit('startDm', userId);
    showNewDmSearch.value = false;
    searchQuery.value = '';
    searchResults.value = [];
};

const toggleNewDmSearch = () => {
    showNewDmSearch.value = !showNewDmSearch.value;
    if (!showNewDmSearch.value) {
        searchQuery.value = '';
        searchResults.value = [];
    }
};
</script>

<template>
    <div class="flex h-full w-60 flex-col border-r border-sidebar-border bg-sidebar">
        <div class="flex h-12 items-center justify-between border-b border-sidebar-border px-4 shadow-sm">
            <h2 class="text-sm font-semibold text-sidebar-foreground">
                Direct Messages
            </h2>
            <button
                type="button"
                class="rounded p-1 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                title="New Message"
                @click="toggleNewDmSearch"
            >
                <Plus v-if="!showNewDmSearch" :size="18" />
                <X v-else :size="18" />
            </button>
        </div>

        <div v-if="showNewDmSearch" class="border-b border-sidebar-border p-2">
            <div class="relative">
                <Search :size="14" class="absolute top-1/2 left-2.5 -translate-y-1/2 text-sidebar-foreground/50" />
                <input
                    type="text"
                    class="w-full rounded bg-sidebar-accent/50 py-1.5 pr-2 pl-8 text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus:bg-sidebar-accent focus:outline-none"
                    placeholder="Find or start a conversation"
                    :value="searchQuery"
                    @input="handleSearch(($event.target as HTMLInputElement).value)"
                />
            </div>
            <div v-if="searchResults.length > 0" class="mt-1 max-h-48 overflow-y-auto">
                <button
                    v-for="user in searchResults"
                    :key="user.id"
                    type="button"
                    class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
                    @click="selectSearchUser(user.id)"
                >
                    <div class="relative">
                        <div class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                            {{ user.username?.[0]?.toUpperCase() || '?' }}
                        </div>
                        <div
                            class="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-sidebar"
                            :class="getStatusColor(user.id)"
                        />
                    </div>
                    <span class="truncate">{{ user.display_name || user.username }}</span>
                </button>
            </div>
            <div v-else-if="searchQuery && !isSearching" class="px-2 py-3 text-center text-xs text-sidebar-foreground/50">
                No users found
            </div>
        </div>

        <div class="flex-1 overflow-y-auto">
            <div class="border-b border-sidebar-border px-2 py-2">
                <button
                    type="button"
                    class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                    @click="$emit('switchToChannels')"
                >
                    <ArrowLeft :size="18" />
                    Back to Channels
                </button>
            </div>

            <div class="p-2">
                <div
                    v-if="dmGroups.length === 0"
                    class="px-2 py-8 text-center text-sm text-sidebar-foreground/50"
                >
                    <p>No direct messages yet</p>
                    <p class="mt-1 text-xs">Click + to start a conversation</p>
                </div>

                <button
                    v-for="dm in dmGroups"
                    :key="dm.id"
                    type="button"
                    class="flex w-full items-center gap-3 rounded px-2 py-2 text-left transition-colors"
                    :class="
                        selectedDmGroupId === dm.id
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                    "
                    @click="$emit('selectDm', dm.id)"
                >
                    <div class="relative">
                        <div class="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                            {{ dm.other_user?.username?.[0]?.toUpperCase() || '?' }}
                        </div>
                        <div
                            v-if="dm.other_user"
                            class="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-sidebar"
                            :class="getStatusColor(dm.other_user.id)"
                        />
                    </div>

                    <div class="min-w-0 flex-1">
                        <div class="flex items-baseline justify-between gap-2">
                            <span class="truncate text-sm font-medium">
                                {{ dm.name }}
                            </span>
                            <span
                                v-if="dm.last_message_at"
                                class="shrink-0 text-[10px] text-sidebar-foreground/50"
                            >
                                {{ formatTime(dm.last_message_at) }}
                            </span>
                        </div>
                        <p
                            v-if="dm.last_message"
                            class="truncate text-xs text-sidebar-foreground/60"
                        >
                            {{ truncateMessage(dm.last_message.content) }}
                        </p>
                    </div>
                </button>
            </div>
        </div>
    </div>
</template>
