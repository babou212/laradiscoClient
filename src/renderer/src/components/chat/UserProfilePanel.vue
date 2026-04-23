<script setup lang="ts">
import { MessageSquare } from 'lucide-vue-next';
import { computed, watch, type CSSProperties } from 'vue';
import { useI18n } from 'vue-i18n';
import { formatLocalizedDate } from '@/lib/utils';
import { useUsersStore } from '@/stores/users';
import type { OnlineUser } from '@/types/user';

type Props = {
    user: OnlineUser | null;
    show: boolean;
    isCurrentUser?: boolean;
    anchorPosition?: { x: number; y: number };
};

const props = defineProps<Props>();
const emit = defineEmits<{
    close: [];
    sendMessage: [userId: string];
}>();

const usersStore = useUsersStore();
const { t } = useI18n();

const storedUser = computed(() => (props.user ? usersStore.get(props.user.id) : null));
const includedRoles = computed(() => storedUser.value?.roles ?? []);

watch(
    () => [props.show, props.user?.id] as const,
    ([show, userId]) => {
        if (!show || !userId) return;
        const id = String(userId);
        const existing = usersStore.get(id);
        if (!existing || existing.created_at === null) {
            void usersStore.fetch(id);
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

const statusLabels = computed<Record<string, string>>(() => ({
    online: t('chat.userProfile.status.online'),
    idle: t('chat.userProfile.status.idle'),
    dnd: t('chat.userProfile.status.dnd'),
    offline: t('chat.userProfile.status.offline'),
}));

const userInitials = computed(() => {
    if (!props.user) return '?';
    const name = usersStore.displayName(props.user.id, props.user.display_name || props.user.username);
    return name[0]?.toUpperCase() || '?';
});

const displayName = computed(() => {
    if (!props.user) return t('chat.userProfile.unknownUser');
    const name = usersStore.displayName(props.user.id, props.user.display_name || props.user.username);
    return name.trim() || t('chat.userProfile.unknownUser');
});

const memberSince = computed(() => {
    const createdAt = storedUser.value?.created_at;
    if (!createdAt) return t('chat.userProfile.memberSinceUnknown');
    const formatted = formatLocalizedDate(createdAt, 'PP');
    return formatted || t('chat.userProfile.memberSinceUnknown');
});

const handleSendMessage = () => {
    if (props.user) {
        emit('sendMessage', props.user.id);
    }
};

const handleClose = () => {
    emit('close');
};

const PANEL_WIDTH = 320;
const PANEL_HEIGHT_ESTIMATE = 420;
const MARGIN = 12;

const panelStyle = computed<CSSProperties | undefined>(() => {
    if (!props.anchorPosition) return undefined;
    const { x, y } = props.anchorPosition;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = x;
    if (left + PANEL_WIDTH > vw - MARGIN) {
        left = vw - PANEL_WIDTH - MARGIN;
    }
    left = Math.max(MARGIN, left);

    let top = y + MARGIN;
    if (top + PANEL_HEIGHT_ESTIMATE > vh - MARGIN) {
        top = y - PANEL_HEIGHT_ESTIMATE - MARGIN;
    }
    top = Math.max(MARGIN, top);

    return {
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
    };
});
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
            class="border-border bg-popover z-50 w-80 overflow-hidden rounded-lg border shadow-2xl"
            :class="!anchorPosition && 'fixed top-20 right-64'"
            :style="panelStyle"
        >
            <div class="from-primary/30 via-primary/20 to-primary/10 relative h-16 bg-linear-to-br"></div>

            <div class="relative -mt-10 px-4">
                <div class="relative inline-block">
                    <div
                        v-if="usersStore.avatarUrl(user.id, 'medium')"
                        class="border-popover bg-muted size-20 overflow-hidden rounded-full border-4"
                    >
                        <img
                            :src="usersStore.avatarUrl(user.id, 'medium')!"
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
                    <h3 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                        {{ t('chat.userProfile.memberSince') }}
                    </h3>
                    <p class="text-popover-foreground mt-1 text-sm">
                        {{ memberSince }}
                    </p>
                </div>

                <div v-if="includedRoles.length" class="bg-background/50 rounded-lg p-3">
                    <h3 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                        {{ t('chat.userProfile.roles') }}
                    </h3>
                    <div class="mt-2 flex flex-wrap gap-1.5">
                        <span
                            v-for="role in includedRoles"
                            :key="role.id"
                            class="border-border bg-background text-popover-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium"
                        >
                            <span class="size-2.5 rounded-full" :style="{ backgroundColor: role.color }"></span>
                            {{ role.name }}
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
                    {{ t('chat.userProfile.sendMessage') }}
                </button>
            </div>
        </div>
    </Transition>
</template>
