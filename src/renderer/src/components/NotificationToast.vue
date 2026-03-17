<!-- NotificationToast - Toast notifications for real-time events -->

<script setup lang="ts">
import { AtSign, Bell, MessageSquare, X } from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { useNotificationsStore, type ToastNotification } from '@/stores/notifications';

const router = useRouter();
const notificationStore = useNotificationsStore();

const isDmNotification = (notification: ToastNotification): boolean => {
    return notification.data.notification_type === 'direct_message';
};

const getNotificationIcon = (notification: ToastNotification) => {
    if (isDmNotification(notification)) return MessageSquare;
    return notification.data.mention_type === 'user' ? AtSign : Bell;
};

const getMentionLabel = (notification: ToastNotification): string => {
    const { data } = notification;
    if (data.mention_type === 'everyone') return '@everyone';
    if (data.mention_type === 'here') return '@here';
    return `@${data.sender_username}`;
};

const getDisplayContent = (notification: ToastNotification): string => {
    const { data } = notification;
    if (data.decrypted_content) return data.decrypted_content;
    if (data.is_encrypted) return '[Encrypted message]';
    return data.content;
};

const getDisplayPreview = (notification: ToastNotification): string => {
    const content = getDisplayContent(notification);
    return content.length > 80 ? content.substring(0, 80) + '...' : content;
};

const handleClick = (notification: ToastNotification) => {
    notificationStore.markAsRead(notification.id);
    notificationStore.dismissToast(notification.id);
    if (isDmNotification(notification)) {
        router.push({ name: 'direct-messages', params: { threadId: notification.data.dm_group_id } });
    } else if (notification.data.channel_id) {
        router.push({ name: 'chat', params: { channelId: notification.data.channel_id } });
    }
};
</script>

<template>
    <div
        class="pointer-events-none fixed top-[calc(var(--titlebar-height)+0.5rem)] right-4 z-[100] flex flex-col gap-2"
    >
        <Transition
            v-for="toast in notificationStore.toasts"
            :key="toast.id"
            enter-active-class="transition-all duration-300 ease-out"
            enter-from-class="translate-x-full opacity-0"
            enter-to-class="translate-x-0 opacity-100"
            leave-active-class="transition-all duration-300 ease-in"
            leave-from-class="translate-x-0 opacity-100"
            leave-to-class="translate-x-full opacity-0"
        >
            <div
                v-if="!toast.dismissing"
                class="border-border bg-popover hover:bg-accent/50 pointer-events-auto w-80 cursor-pointer overflow-hidden rounded-lg border shadow-lg transition-colors"
                @click="handleClick(toast)"
            >
                <div class="flex items-start gap-3 p-3">
                    <div
                        class="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full"
                    >
                        <component :is="getNotificationIcon(toast)" :size="16" />
                    </div>

                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1 text-sm font-semibold">
                            <template v-if="isDmNotification(toast)">
                                <span class="text-primary">
                                    {{ toast.data.sender_username }}
                                </span>
                                <span class="text-muted-foreground"> sent a message </span>
                            </template>
                            <template v-else>
                                <span class="text-primary">
                                    {{ getMentionLabel(toast) }}
                                </span>
                                <span class="text-muted-foreground"> in #{{ toast.data.channel_name }} </span>
                            </template>
                        </div>
                        <div class="mt-0.5 flex items-baseline gap-1.5 text-sm">
                            <span class="font-medium"> {{ toast.data.sender_username }}: </span>
                            <span class="text-muted-foreground truncate">
                                {{ getDisplayPreview(toast) }}
                            </span>
                        </div>
                    </div>

                    <button
                        class="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 rounded p-1 transition-colors"
                        @click.stop="notificationStore.dismissToast(toast.id)"
                    >
                        <X :size="14" />
                    </button>
                </div>
            </div>
        </Transition>
    </div>
</template>
