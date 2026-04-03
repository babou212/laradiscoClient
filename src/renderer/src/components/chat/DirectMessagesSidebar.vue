<script setup lang="ts">
import { watchDebounced } from '@vueuse/core';
import { ArrowLeft, Plus, Search, X } from 'lucide-vue-next';
import { shallowRef, watch } from 'vue';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getMembers } from '@/api/members';
import { useAvatarStore } from '@/stores/avatar';
import type { DmGroup } from '@/stores/directMessages';
import { usePresenceStore } from '@/stores/presence';

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
const avatarStore = useAvatarStore();

const showNewDmSearch = shallowRef(false);
const searchQuery = shallowRef('');
const searchResults = shallowRef<
    Array<{
        id: number;
        username: string;
        display_name: string;
        avatar_urls: { thumb: string; small: string; medium: string } | null;
    }>
>([]);
const isSearching = shallowRef(false);

watch(searchQuery, (q) => {
    if (!q.trim()) searchResults.value = [];
});

watchDebounced(
    searchQuery,
    async (q) => {
        if (!q.trim()) return;
        isSearching.value = true;
        try {
            const response = await getMembers({ 'filter[search]': q });
            searchResults.value = response.data.map((u) => ({
                id: Number(u.id),
                username: u.attributes.username,
                display_name: u.attributes.display_name ?? u.attributes.username,
                avatar_urls: u.attributes.avatar_urls ?? null,
            }));
        } catch {
            searchResults.value = [];
        } finally {
            isSearching.value = false;
        }
    },
    { debounce: 300 },
);

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
    <div class="border-sidebar-border bg-sidebar flex h-full w-60 flex-col border-r">
        <div class="border-sidebar-border flex h-12 items-center justify-between border-b px-4 shadow-sm">
            <h2 class="text-sidebar-foreground text-sm font-semibold">Direct Messages</h2>
            <button
                type="button"
                class="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground rounded p-1 transition-colors"
                title="New Message"
                @click="toggleNewDmSearch"
            >
                <Plus v-if="!showNewDmSearch" :size="18" />
                <X v-else :size="18" />
            </button>
        </div>

        <div v-if="showNewDmSearch" class="border-sidebar-border border-b p-2">
            <div class="relative">
                <Search :size="14" class="text-sidebar-foreground/50 absolute top-1/2 left-2.5 -translate-y-1/2" />
                <input
                    v-model="searchQuery"
                    type="text"
                    class="bg-sidebar-accent/50 text-sidebar-foreground placeholder:text-sidebar-foreground/40 focus:bg-sidebar-accent w-full rounded py-1.5 pr-2 pl-8 text-sm focus:outline-none"
                    placeholder="Find or start a conversation"
                />
            </div>
            <div v-if="searchResults.length > 0" class="mt-1 max-h-48 overflow-y-auto">
                <button
                    v-for="user in searchResults"
                    :key="user.id"
                    type="button"
                    class="text-sidebar-foreground hover:bg-sidebar-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors"
                    @click="selectSearchUser(user.id)"
                >
                    <div class="relative">
                        <Avatar class="size-7 shrink-0">
                            <AvatarImage
                                v-if="avatarStore.getAvatarUrl(user.id, 'thumb')"
                                :src="avatarStore.getAvatarUrl(user.id, 'thumb')!"
                                :alt="user.username"
                            />
                            <AvatarFallback class="bg-primary text-primary-foreground text-xs font-semibold">
                                {{ user.username?.[0]?.toUpperCase() || '?' }}
                            </AvatarFallback>
                        </Avatar>
                        <div
                            class="border-sidebar absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2"
                            :class="getStatusColor(user.id)"
                        />
                    </div>
                    <span class="truncate">{{ user.display_name || user.username }}</span>
                </button>
            </div>
            <div
                v-else-if="searchQuery && !isSearching"
                class="text-sidebar-foreground/50 px-2 py-3 text-center text-xs"
            >
                No users found
            </div>
        </div>

        <div class="flex-1 overflow-y-auto">
            <div class="border-sidebar-border border-b px-2 py-2">
                <button
                    type="button"
                    class="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm"
                    @click="$emit('switchToChannels')"
                >
                    <ArrowLeft :size="18" />
                    Back to Channels
                </button>
            </div>

            <div class="p-2">
                <div v-if="dmGroups.length === 0" class="text-sidebar-foreground/50 px-2 py-8 text-center text-sm">
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
                        <Avatar class="size-9 shrink-0">
                            <AvatarImage
                                v-if="dm.other_user && avatarStore.getAvatarUrl(dm.other_user.id, 'thumb')"
                                :src="avatarStore.getAvatarUrl(dm.other_user!.id, 'thumb')!"
                                :alt="dm.other_user?.username"
                            />
                            <AvatarFallback class="bg-primary text-primary-foreground text-sm font-semibold">
                                {{ dm.other_user?.username?.[0]?.toUpperCase() || '?' }}
                            </AvatarFallback>
                        </Avatar>
                        <div
                            v-if="dm.other_user"
                            class="border-sidebar absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2"
                            :class="getStatusColor(dm.other_user.id)"
                        />
                    </div>

                    <div class="min-w-0 flex-1">
                        <div class="flex items-baseline justify-between gap-2">
                            <span class="truncate text-sm font-medium">
                                {{ dm.name }}
                            </span>
                            <span v-if="dm.last_message_at" class="text-sidebar-foreground/50 shrink-0 text-[10px]">
                                {{ formatTime(dm.last_message_at) }}
                            </span>
                        </div>
                        <p v-if="dm.last_message" class="text-sidebar-foreground/60 truncate text-xs">
                            {{
                                dm.last_message.decrypted_content
                                    ? truncateMessage(dm.last_message.decrypted_content)
                                    : dm.last_message.decrypt_error
                                      ? '[Unable to decrypt]'
                                      : '[Encrypted message]'
                            }}
                        </p>
                    </div>
                </button>
            </div>
        </div>
    </div>
</template>
