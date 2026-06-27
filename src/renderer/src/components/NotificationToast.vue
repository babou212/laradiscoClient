<script setup lang="ts">
import { AtSign, Bell, MessageSquare, Reply, X } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { navigateToNotification, useNotificationsStore, type ToastNotification } from '@/stores/notifications';

const { t } = useI18n();
const notificationStore = useNotificationsStore();

const isDmNotification = (notification: ToastNotification): boolean => {
    return notification.data.notification_type === 'direct_message';
};

const isThreadNotification = (notification: ToastNotification): boolean => {
    return notification.data.notification_type === 'thread_reply';
};

const getNotificationIcon = (notification: ToastNotification) => {
    if (isDmNotification(notification)) return MessageSquare;
    if (isThreadNotification(notification)) return Reply;
    return notification.data.mention_type === 'user' ? AtSign : Bell;
};

const getMentionLabel = (notification: ToastNotification): string => {
    const { data } = notification;
    if (data.mention_type === 'everyone') return '@everyone';
    if (data.mention_type === 'here') return '@here';
    return `@${data.sender_username}`;
};

const getDisplayPreview = (notification: ToastNotification): string => {
    const content = notification.data.content ?? '';
    return content.length > 80 ? content.substring(0, 80) + '...' : content;
};

const handleClick = (notification: ToastNotification) => {
    notificationStore.markAsRead(notification.id);
    notificationStore.dismissToast(notification.id);
    void navigateToNotification(notification);
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
                                <span class="text-muted-foreground"> {{ t('notifications.sentMessage') }} </span>
                            </template>
                            <template v-else-if="isThreadNotification(toast)">
                                <span class="text-primary">
                                    {{ toast.data.sender_username }}
                                </span>
                                <span class="text-muted-foreground">
                                    {{ t('notifications.repliedInThread', { thread: toast.data.thread_name }) }}
                                </span>
                            </template>
                            <template v-else>
                                <span class="text-primary">
                                    {{ getMentionLabel(toast) }}
                                </span>
                                <span class="text-muted-foreground">
                                    {{ t('notifications.inChannelPrefix', { channel: toast.data.channel_name }) }}
                                </span>
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
