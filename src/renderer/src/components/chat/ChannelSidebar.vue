<script setup lang="ts">
import { Hash, ChevronDown, ChevronRight, MessageSquare, Settings, LogOut, MoreVertical } from 'lucide-vue-next';
import { computed, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import VoiceChannelItem from './VoiceChannelItem.vue';
import VoiceControlPanel from './VoiceControlPanel.vue';
import { updatePresence } from '@/api/presence';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { setManualPresenceStatus } from '@/composables/usePresenceUpdater';
import { useAuthStore } from '@/stores/auth';
import { useAvatarStore } from '@/stores/avatar';
import type { DmGroup } from '@/stores/directMessages';
import { usePresenceStore } from '@/stores/presence';
import { useUserNamesStore } from '@/stores/userNames';
import type { UserStatusType } from '@/types';
import type { Category, Channel } from '@/types/chat';

type Props = {
    categories: Category[];
    directMessages: DmGroup[];
    selectedChannelId?: string;
    serverName?: string;
};

withDefaults(defineProps<Props>(), {
    serverName: 'Laradisco',
});

const emit = defineEmits<{
    selectChannel: [channelId: string];
    switchToDms: [];
}>();

const router = useRouter();
const authStore = useAuthStore();
const avatarStore = useAvatarStore();
const presenceStore = usePresenceStore();
const userNamesStore = useUserNamesStore();

const user = computed(() => authStore.user);

const collapsedCategories = ref<Set<string>>(new Set());
const showUserPopup = shallowRef(false);
const currentStatus = shallowRef<UserStatusType>('online');
const currentCustomStatus = shallowRef<string | null>(null);

const getTextChannels = (channels: Channel[]) => {
    return channels.filter((c) => c.type !== 'voice');
};

const getVoiceChannels = (channels: Channel[]) => {
    return channels.filter((c) => c.type === 'voice');
};

watch(
    () => (user.value?.id ? presenceStore.getUserStatus(user.value.id) : undefined),
    (userStatus) => {
        if (userStatus) {
            currentStatus.value = userStatus.status || 'online';
            currentCustomStatus.value = userStatus.custom_status || null;
        }
    },
    { deep: true },
);

const toggleCategory = (categoryId: string) => {
    if (collapsedCategories.value.has(categoryId)) {
        collapsedCategories.value.delete(categoryId);
    } else {
        collapsedCategories.value.add(categoryId);
    }
};

const selectChannel = (channelId: string) => {
    emit('selectChannel', channelId);
};

const setStatus = async (status: UserStatusType) => {
    currentStatus.value = status;

    setManualPresenceStatus(status);

    if (user.value?.id) {
        presenceStore.updateUserStatus(user.value.id, status, currentCustomStatus.value);
    }

    try {
        await updatePresence({
            status: status,
            custom_status: currentCustomStatus.value,
        });
    } catch (error) {
        console.error(error);
    }
    showUserPopup.value = false;
};

const logout = async () => {
    await authStore.logout();
    router.push({ name: 'login' });
};

const statusOptions = [
    {
        value: 'online' as UserStatusType,
        label: 'Online',
        color: 'bg-green-500',
    },
    {
        value: 'dnd' as UserStatusType,
        label: 'Do Not Disturb',
        color: 'bg-red-500',
    },
    {
        value: 'offline' as UserStatusType,
        label: 'Invisible',
        color: 'bg-gray-500',
    },
];
</script>

<template>
    <div class="bg-sidebar flex h-full w-full flex-col">
        <div class="flex-1 overflow-y-auto">
            <div class="px-2 py-2">
                <button
                    type="button"
                    class="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs font-semibold tracking-wide uppercase"
                    @click="$emit('switchToDms')"
                >
                    <MessageSquare :size="16" />
                    Direct Messages
                </button>
            </div>

            <div class="px-2 py-2">
                <div v-for="category in categories" :key="category.id" class="mb-4">
                    <button
                        type="button"
                        class="text-sidebar-foreground/70 hover:text-sidebar-foreground flex w-full items-center gap-1 px-2 py-1 text-xs font-semibold tracking-wide uppercase"
                        @click="toggleCategory(category.id)"
                    >
                        <ChevronRight
                            v-if="collapsedCategories.has(category.id)"
                            :size="12"
                            class="transition-transform"
                        />
                        <ChevronDown v-else :size="12" class="transition-transform" />
                        {{ category.name }}
                    </button>

                    <div v-if="!collapsedCategories.has(category.id)">
                        <div class="mt-1 space-y-0.5">
                            <button
                                v-for="channel in getTextChannels(category.channels)"
                                :key="channel.id"
                                type="button"
                                class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors"
                                :class="
                                    selectedChannelId === channel.id
                                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                                        : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                                "
                                @click="selectChannel(channel.id)"
                            >
                                <Hash :size="16" class="shrink-0" />
                                <span class="truncate">{{ channel.name }}</span>
                            </button>
                        </div>

                        <div v-if="getVoiceChannels(category.channels).length > 0" class="mt-1 space-y-0.5">
                            <VoiceChannelItem
                                v-for="channel in getVoiceChannels(category.channels)"
                                :key="channel.id"
                                :channel="channel"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <VoiceControlPanel />

        <div class="relative p-3">
            <div v-if="showUserPopup" class="fixed inset-0 z-10" @click="showUserPopup = false"></div>
            <div
                v-if="showUserPopup"
                class="border-sidebar-border bg-popover absolute right-0 bottom-full left-0 z-20 mx-3 mb-2 rounded-2xl border p-2 shadow-lg"
            >
                <div class="mb-2 space-y-1">
                    <button
                        v-for="status in statusOptions"
                        :key="status.value"
                        type="button"
                        class="text-popover-foreground hover:bg-accent flex w-full items-center gap-3 rounded px-3 py-2 text-sm transition-colors"
                        @click="setStatus(status.value)"
                    >
                        <span class="size-2.5 rounded-full" :class="status.color"></span>
                        <span>{{ status.label }}</span>
                    </button>
                </div>

                <div class="border-sidebar-border my-2 border-t"></div>

                <button
                    type="button"
                    class="text-popover-foreground hover:bg-accent flex w-full items-center gap-3 rounded px-3 py-2 text-sm transition-colors"
                    @click="router.push({ name: 'settings-profile' })"
                >
                    <Settings :size="16" />
                    <span>Settings</span>
                </button>

                <button
                    type="button"
                    class="text-destructive hover:bg-accent flex w-full items-center gap-3 rounded px-3 py-2 text-sm transition-colors"
                    @click="logout"
                >
                    <LogOut :size="16" />
                    <span>Logout</span>
                </button>
            </div>

            <button
                type="button"
                class="border-sidebar-border bg-sidebar-accent hover:bg-sidebar-accent/80 flex w-full items-center gap-3 rounded-full border px-3 py-2 shadow-lg transition-colors"
                @click="showUserPopup = !showUserPopup"
            >
                <Avatar class="size-8 shrink-0">
                    <AvatarImage
                        v-if="user && avatarStore.getAvatarUrl(user.id, 'thumb')"
                        :src="avatarStore.getAvatarUrl(user!.id, 'thumb')!"
                        :alt="user?.name"
                    />
                    <AvatarFallback class="bg-primary text-primary-foreground text-sm font-semibold">
                        {{ user ? userNamesStore.getDisplayName(user.id, user.name)?.[0]?.toUpperCase() : 'U' }}
                    </AvatarFallback>
                </Avatar>
                <div class="min-w-0 flex-1 text-left">
                    <div class="text-sidebar-foreground truncate text-sm font-medium">
                        {{ user ? userNamesStore.getDisplayName(user.id, user.username || user.name) : '' }}
                    </div>
                    <div class="text-sidebar-foreground/60 truncate text-xs">
                        {{ currentCustomStatus || currentStatus }}
                    </div>
                </div>
                <MoreVertical :size="20" class="text-sidebar-foreground/60 shrink-0" />
            </button>
        </div>
    </div>
</template>
