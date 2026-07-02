<script setup lang="ts">
import {
    Hash,
    ChevronDown,
    ChevronRight,
    MessageSquare,
    Settings,
    LogOut,
    MoreVertical,
    UserPlus,
    Shield,
    Users,
    ShieldAlert,
    ScrollText,
    ServerCog,
} from 'lucide-vue-next';
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { updatePresence } from '@/api/presence';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuthStore } from '@/stores/auth';
import type { DmGroup } from '@/stores/directMessages';
import { usePresenceStore } from '@/stores/presence';
import { useServerStore } from '@/stores/server';
import { useUsersStore } from '@/stores/users';
import type { UserStatusType } from '@/types';
import type { Channel } from '@/types/chat';
import VoiceChannelItem from './VoiceChannelItem.vue';
import VoiceControlPanel from './VoiceControlPanel.vue';

type Props = {
    categories: import('@/types/chat').Category[];
    directMessages: DmGroup[];
    selectedChannelId?: string;
    serverName?: string;
};

const props = withDefaults(defineProps<Props>(), {
    serverName: 'Laradisco',
});

const emit = defineEmits<{
    selectChannel: [channelId: string];
    switchToDms: [];
}>();

const router = useRouter();
const authStore = useAuthStore();
const serverStore = useServerStore();
const usersStore = useUsersStore();
const presenceStore = usePresenceStore();
const { t } = useI18n();

const user = computed(() => authStore.user);

const collapsedCategories = ref<Set<string>>(new Set());
const showServerMenu = shallowRef(false);
const showUserPopup = shallowRef(false);
const serverLogoCached = shallowRef<string | null>(null);

const permissions = computed(() => authStore.user?.permissions);
const adminNavItems = computed(() => {
    const perms = permissions.value;
    if (!perms) return [];
    const items: { label: string; routeName: string; icon: unknown }[] = [];
    if (perms.canManageServer || perms.isAdministrator)
        items.push({ label: t('settings.nav.serverProfile'), routeName: 'settings-server-profile', icon: ServerCog });
    if (perms.canInviteMembers || perms.isAdministrator)
        items.push({ label: t('settings.nav.inviteLinks'), routeName: 'settings-invite-links', icon: UserPlus });
    if (perms.canManageRoles || perms.isAdministrator) {
        items.push({ label: t('settings.nav.roles'), routeName: 'settings-roles', icon: Shield });
        items.push({ label: t('settings.nav.members'), routeName: 'settings-members', icon: Users });
    }
    if (perms.canManageChannels || perms.isAdministrator)
        items.push({ label: t('settings.nav.channels'), routeName: 'settings-channels', icon: Hash });
    if (perms.canBanMembers || perms.canKickMembers || perms.isAdministrator)
        items.push({ label: t('settings.nav.moderation'), routeName: 'settings-moderation', icon: ShieldAlert });
    if (perms.canViewAuditLog || perms.isAdministrator)
        items.push({ label: t('settings.nav.auditLog'), routeName: 'settings-audit-log', icon: ScrollText });
    return items;
});

const serverInitials = computed(() => {
    const host = serverStore.activeHost ?? props.serverName ?? 'S';
    return host
        .replace(/^https?:\/\//, '')
        .charAt(0)
        .toUpperCase();
});

async function resolveServerLogo(url: string): Promise<void> {
    if (!window.api?.avatar) {
        serverLogoCached.value = url;
        return;
    }
    const cached = await window.api.avatar.resolve('0', url).catch(() => null);
    serverLogoCached.value = cached ?? url;
}

watch(
    () => serverStore.serverLogoUrls?.thumb ?? serverStore.serverLogoUrls?.original ?? null,
    (url) => {
        if (!url) {
            serverLogoCached.value = null;
            return;
        }
        void resolveServerLogo(url);
    },
    { immediate: true },
);

onMounted(async () => {
    await serverStore.loadServerSettings();
});

const currentStatus = shallowRef<UserStatusType>('online');
const currentCustomStatus = shallowRef<string | null>(null);

const getTextChannels = (channels: Channel[]) => channels.filter((c) => c.type !== 'voice');
const getVoiceChannels = (channels: Channel[]) => channels.filter((c) => c.type === 'voice');

const afkChannel = computed<Channel | null>(() =>
    serverStore.afkChannelId
        ? { id: String(serverStore.afkChannelId), name: 'afk', topic: null, type: 'voice' }
        : null,
);

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

const statusOptions = computed(() => [
    {
        value: 'online' as UserStatusType,
        label: t('chat.channelSidebar.statusOnline'),
        color: 'bg-green-500',
    },
    {
        value: 'dnd' as UserStatusType,
        label: t('chat.channelSidebar.statusDnd'),
        color: 'bg-red-500',
    },
    {
        value: 'offline' as UserStatusType,
        label: t('chat.channelSidebar.statusInvisible'),
        color: 'bg-gray-500',
    },
]);
</script>

<template>
    <div class="bg-sidebar flex h-full w-full flex-col">
        <div class="flex-1 overflow-y-auto">
            <div class="border-sidebar-border relative border-b">
                <div v-if="showServerMenu" class="fixed inset-0 z-10" @click="showServerMenu = false" />
                <button
                    type="button"
                    class="text-sidebar-foreground flex w-full items-center gap-3 px-4 py-3 font-semibold transition-colors"
                    :class="{
                        'hover:bg-sidebar-accent cursor-pointer': adminNavItems.length > 0,
                        'cursor-default': adminNavItems.length === 0,
                    }"
                    @click="adminNavItems.length > 0 && (showServerMenu = !showServerMenu)"
                >
                    <Avatar class="size-7 shrink-0 rounded-md">
                        <AvatarImage
                            v-if="serverLogoCached"
                            :src="serverLogoCached"
                            alt="Server logo"
                            class="object-cover"
                        />
                        <AvatarFallback class="bg-primary text-primary-foreground rounded-md text-xs font-bold">
                            {{ serverInitials }}
                        </AvatarFallback>
                    </Avatar>
                    <span class="min-w-0 flex-1 truncate text-left">{{ serverStore.activeHost ?? serverName }}</span>
                    <ChevronDown
                        v-if="adminNavItems.length > 0"
                        :size="14"
                        class="text-sidebar-foreground/60 shrink-0 transition-transform duration-200"
                        :class="{ 'rotate-180': showServerMenu }"
                    />
                </button>

                <div
                    v-if="showServerMenu && adminNavItems.length > 0"
                    class="border-sidebar-border bg-popover absolute top-full right-2 left-2 z-20 mt-1 overflow-hidden rounded-lg border shadow-xl"
                >
                    <div class="p-1">
                        <button
                            v-for="item in adminNavItems"
                            :key="item.routeName"
                            type="button"
                            class="text-popover-foreground hover:bg-accent flex w-full items-center justify-between rounded px-3 py-2 text-sm transition-colors"
                            @click="
                                router.push({ name: item.routeName });
                                showServerMenu = false;
                            "
                        >
                            <span>{{ item.label }}</span>
                            <component :is="item.icon" :size="15" class="text-muted-foreground" />
                        </button>
                    </div>
                </div>
            </div>

            <div class="px-2 py-2">
                <button
                    type="button"
                    class="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs font-semibold tracking-wide uppercase"
                    @click="$emit('switchToDms')"
                >
                    <MessageSquare :size="16" />
                    {{ t('chat.channelSidebar.directMessages') }}
                </button>
            </div>

            <div class="px-2 py-2">
                <div v-for="category in categories" :key="category.id" class="mb-4">
                    <button
                        type="button"
                        data-context-category
                        :data-category-id="category.id"
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
                                data-context-channel
                                :data-channel-id="channel.id"
                                :data-category-id="category.id"
                                :data-channel-type="channel.type"
                                class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm transition-colors"
                                :class="
                                    selectedChannelId === channel.id
                                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                                        : channel.has_unread
                                          ? 'hover:bg-sidebar-accent/50 font-semibold text-white'
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
                                :category-id="category.id"
                            />
                        </div>
                    </div>
                </div>

                <VoiceChannelItem v-if="afkChannel" :channel="afkChannel" category-id="afk" class="-mt-3.5" />
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
                    <span>{{ t('chat.channelSidebar.settings') }}</span>
                </button>

                <button
                    type="button"
                    class="text-destructive hover:bg-accent flex w-full items-center gap-3 rounded px-3 py-2 text-sm transition-colors"
                    @click="logout"
                >
                    <LogOut :size="16" />
                    <span>{{ t('chat.channelSidebar.logout') }}</span>
                </button>
            </div>

            <button
                type="button"
                class="border-sidebar-border bg-sidebar-accent hover:bg-sidebar-accent/80 flex w-full items-center gap-3 rounded-full border px-3 py-2 shadow-lg transition-colors"
                @click="showUserPopup = !showUserPopup"
            >
                <Avatar class="size-8 shrink-0">
                    <AvatarImage
                        v-if="user && usersStore.avatarUrl(user.id, 'thumb')"
                        :src="usersStore.avatarUrl(user!.id, 'thumb')!"
                        :alt="user?.username"
                    />
                    <AvatarFallback class="bg-primary text-primary-foreground text-sm font-semibold">
                        {{ user ? usersStore.displayName(user.id, user.username)?.[0]?.toUpperCase() : 'U' }}
                    </AvatarFallback>
                </Avatar>
                <div class="min-w-0 flex-1 text-left">
                    <div class="text-sidebar-foreground truncate text-sm font-medium">
                        {{ user ? usersStore.displayName(user.id, user.username) : '' }}
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
