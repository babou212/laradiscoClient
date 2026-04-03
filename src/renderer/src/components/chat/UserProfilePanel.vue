<script setup lang="ts">
import { MessageSquare } from 'lucide-vue-next';
import { computed, shallowRef, watch } from 'vue';
import { getUserProfile } from '@/api/users';
import { useAvatarStore } from '@/stores/avatar';
import { useUserNamesStore } from '@/stores/userNames';
import type { OnlineUser } from '@/types/user';
import type { UserResource } from '@/api/types';

interface IncludedRole {
    id: string;
    type: string;
    attributes: {
        name: string;
        color: string;
    };
}

type Props = {
    user: OnlineUser | null;
    show: boolean;
    isCurrentUser?: boolean;
};

const props = defineProps<Props>();
const emit = defineEmits<{
    close: [];
    sendMessage: [userId: string];
}>();

const avatarStore = useAvatarStore();
const userNamesStore = useUserNamesStore();

const fullUser = shallowRef<UserResource | null>(null);
const includedRoles = shallowRef<IncludedRole[]>([]);
const loading = shallowRef(false);

watch(
    () => props.show,
    async (show) => {
        if (show && props.user) {
            loading.value = true;
            fullUser.value = null;
            includedRoles.value = [];
            try {
                const response = await getUserProfile(String(props.user.id));
                fullUser.value = response.data;
                includedRoles.value = (response.included ?? []).filter(
                    (r) => r.type === 'roles',
                ) as IncludedRole[];
            } catch (error) {
                if (import.meta.env.DEV) {
                    console.error('Failed to fetch user data:', error);
                }
                fullUser.value = null;
                includedRoles.value = [];
            } finally {
                loading.value = false;
            }
        } else {
            fullUser.value = null;
            includedRoles.value = [];
            loading.value = false;
        }
    },
    { immediate: true },
);

const statusColors: Record<string, string> = {
    online: 'bg-green-500',
    idle: 'bg-orange-500',
    dnd: 'bg-red-500',
    offline: 'bg-gray-500',
};

const statusLabels: Record<string, string> = {
    online: 'Online',
    idle: 'Idle',
    dnd: 'Do Not Disturb',
    offline: 'Offline',
};

const userInitials = computed(() => {
    if (!props.user) return '?';
    const name = userNamesStore.getDisplayName(props.user.id, props.user.display_name || props.user.username);
    return name[0]?.toUpperCase() || '?';
});

const displayName = computed(() => {
    if (!props.user) return 'Unknown User';
    const name = userNamesStore.getDisplayName(props.user.id, props.user.display_name || props.user.username);
    return name.trim() || 'Unknown User';
});

const memberSince = computed(() => {
    if (!fullUser.value?.attributes?.created_at) return 'Unknown';
    const date = new Date(fullUser.value.attributes.created_at);
    if (isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
});

const handleSendMessage = () => {
    if (props.user) {
        emit('sendMessage', props.user.id);
    }
};

const handleClose = () => {
    emit('close');
};
</script>

<template>
    <Transition
        enter-active-class="transition-opacity duration-150"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-150"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
    >
        <div v-if="show && user" class="fixed inset-0 z-40" @click="handleClose"></div>
    </Transition>

    <Transition
        enter-active-class="transition-all duration-200"
        enter-from-class="opacity-0 translate-x-2"
        enter-to-class="opacity-100 translate-x-0"
        leave-active-class="transition-all duration-150"
        leave-from-class="opacity-100 translate-x-0"
        leave-to-class="opacity-0 translate-x-2"
    >
        <div
            v-if="show && user"
            class="border-border bg-popover fixed top-20 right-64 z-50 w-80 overflow-hidden rounded-lg border shadow-2xl"
        >
            <div class="from-primary/30 via-primary/20 to-primary/10 relative h-16 bg-linear-to-br"></div>

            <div class="relative -mt-10 px-4">
                <div class="relative inline-block">
                    <div
                        v-if="avatarStore.getAvatarUrl(user.id, 'medium')"
                        class="border-popover bg-muted size-20 overflow-hidden rounded-full border-4"
                    >
                        <img
                            :src="avatarStore.getAvatarUrl(user.id, 'medium')!"
                            :alt="user.username"
                            class="size-full object-cover"
                        />
                    </div>
                    <div
                        v-else
                        class="border-popover bg-primary text-primary-foreground flex size-20 items-center justify-center rounded-full border-4 text-2xl font-bold"
                    >
                        {{ userInitials }}
                    </div>

                    <div
                        class="border-popover absolute right-0 bottom-0 size-5 rounded-full border-4"
                        :class="statusColors[user.status || 'offline']"
                    ></div>
                </div>
            </div>

            <div class="space-y-3 p-4 pt-2">
                <div class="bg-background/50 rounded-lg p-3">
                    <h2 class="text-popover-foreground text-lg font-bold">
                        {{ displayName }}
                    </h2>
                    <p v-if="user.custom_status" class="text-muted-foreground mt-1 text-xs">
                        {{ user.custom_status }}
                    </p>
                    <div class="mt-2 flex items-center gap-1.5">
                        <div class="size-2 rounded-full" :class="statusColors[user.status || 'offline']"></div>
                        <span class="text-muted-foreground text-xs">{{ statusLabels[user.status || 'offline'] }}</span>
                    </div>
                </div>

                <div class="bg-background/50 rounded-lg p-3">
                    <h3 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Member Since</h3>
                    <div v-if="loading" class="bg-muted mt-1 h-5 w-24 animate-pulse rounded"></div>
                    <p v-else class="text-popover-foreground mt-1 text-sm">
                        {{ memberSince }}
                    </p>
                </div>

                <div v-if="loading || includedRoles.length" class="bg-background/50 rounded-lg p-3">
                    <h3 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Roles</h3>
                    <div v-if="loading" class="mt-2 flex flex-wrap gap-1.5">
                        <span class="bg-muted h-6 w-16 animate-pulse rounded-full"></span>
                        <span class="bg-muted h-6 w-20 animate-pulse rounded-full"></span>
                    </div>
                    <div v-else class="mt-2 flex flex-wrap gap-1.5">
                        <span
                            v-for="role in includedRoles"
                            :key="role.id"
                            class="border-border bg-background text-popover-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
                        >
                            <span class="size-2.5 rounded-full" :style="{ backgroundColor: role.attributes.color }"></span>
                            {{ role.attributes.name }}
                        </span>
                    </div>
                </div>

                <button
                    v-if="!isCurrentUser"
                    type="button"
                    class="bg-primary text-primary-foreground hover:bg-primary/90 flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors"
                    @click="handleSendMessage"
                >
                    <MessageSquare :size="16" />
                    Send Message
                </button>
            </div>
        </div>
    </Transition>
</template>
