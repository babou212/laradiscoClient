<script setup lang="ts">
import { AtSign, Bell, Check, CheckCheck, MessageSquare } from 'lucide-vue-next';
import { onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { formatMessageDate } from '@/lib/utils';
import { useNotificationsStore, type AppNotification } from '@/stores/notifications';

const { t } = useI18n();
const router = useRouter();
const notificationStore = useNotificationsStore();
const showDropdown = ref(false);
const dropdownRef = ref<HTMLElement>();

const isDmNotification = (notification: AppNotification): boolean => {
    return notification.data.notification_type === 'direct_message';
};

const getMentionLabel = (notification: AppNotification): string => {
    const { data } = notification;
    if (data.mention_type === 'everyone') return '@everyone';
    if (data.mention_type === 'here') return '@here';
    return `@${data.sender_username}`;
};

const getDisplayContent = (notification: AppNotification): string => {
    const { data } = notification;
    if (data.decrypted_content) return data.decrypted_content;
    return t('chat.common.encryptedMessage');
};

const handleNotificationClick = async (notification: AppNotification) => {
    showDropdown.value = false;
    await notificationStore.markAsRead(notification.id);
    if (isDmNotification(notification)) {
        router.push({ name: 'direct-messages', params: { threadId: notification.data.dm_group_id } });
    } else if (notification.data.channel_id) {
        router.push({ name: 'chat', params: { channelId: notification.data.channel_id } });
    }
};

const handleClickOutside = (e: MouseEvent) => {
    if (showDropdown.value && dropdownRef.value && !dropdownRef.value.contains(e.target as Node)) {
        const bellButton = (e.target as HTMLElement).closest('[data-notification-bell]');
        if (!bellButton) {
            showDropdown.value = false;
        }
    }
};

onMounted(() => {
    document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
    <div class="relative">
        <button
            data-notification-bell
            class="text-muted-foreground hover:bg-accent hover:text-foreground relative rounded p-1.5 transition-colors"
            :title="t('notificationBell.title')"
            @click="showDropdown = !showDropdown"
        >
            <Bell :size="20" />
            <span
                v-if="notificationStore.unreadCount > 0"
                class="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-bold"
            >
                {{ notificationStore.unreadCount > 9 ? '9+' : notificationStore.unreadCount }}
            </span>
        </button>

        <div
            v-if="showDropdown"
            ref="dropdownRef"
            class="border-border bg-popover absolute top-full right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border shadow-lg"
        >
            <div class="border-border flex items-center justify-between border-b px-3 py-2">
                <h3 class="text-sm font-semibold">{{ t('notificationBell.title') }}</h3>
                <button
                    v-if="notificationStore.unreadCount > 0"
                    class="text-muted-foreground hover:bg-accent hover:text-foreground flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
                    @click="notificationStore.markAllAsRead()"
                >
                    <CheckCheck :size="14" />
                    {{ t('notificationBell.markAllRead') }}
                </button>
            </div>

            <div class="max-h-80 overflow-y-auto">
                <div
                    v-if="notificationStore.notifications.length === 0"
                    class="text-muted-foreground flex flex-col items-center justify-center py-8"
                >
                    <Bell :size="32" class="mb-2 opacity-40" />
                    <p class="text-sm">{{ t('notificationBell.empty') }}</p>
                </div>

                <button
                    v-for="notification in notificationStore.notifications"
                    :key="notification.id"
                    class="group border-border hover:bg-accent/50 flex w-full items-start gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0"
                    @click="handleNotificationClick(notification)"
                >
                    <div
                        class="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full"
                    >
                        <MessageSquare v-if="isDmNotification(notification)" :size="14" />
                        <AtSign v-else :size="14" />
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1 text-xs">
                            <template v-if="isDmNotification(notification)">
                                <span class="text-primary font-semibold">
                                    {{ notification.data.sender_username }}
                                </span>
                                <span class="text-muted-foreground">
                                    {{ ' ' + t('notificationBell.sentMessage') + ' ' }}
                                </span>
                            </template>
                            <template v-else>
                                <span class="text-primary font-semibold">
                                    {{ getMentionLabel(notification) }}
                                </span>
                                <span class="text-muted-foreground">
                                    {{
                                        ' ' +
                                        t('notificationBell.inChannel', { channel: notification.data.channel_name }) +
                                        ' '
                                    }}
                                </span>
                            </template>
                        </div>
                        <p class="text-foreground mt-0.5 truncate text-sm">
                            <span class="font-medium">{{ notification.data.sender_username }}:</span>
                            {{ getDisplayContent(notification).substring(0, 60)
                            }}{{ getDisplayContent(notification).length > 60 ? '...' : '' }}
                        </p>
                        <p class="text-muted-foreground mt-0.5 text-xs">
                            {{ formatMessageDate(notification.created_at) }}
                        </p>
                    </div>
                    <div
                        role="button"
                        tabindex="0"
                        class="text-muted-foreground hover:text-foreground shrink-0 cursor-pointer rounded p-1 opacity-0 transition-opacity group-hover:opacity-100"
                        :title="t('notificationBell.markAsRead')"
                        @click.stop="notificationStore.markAsRead(notification.id)"
                        @keydown.enter.stop="notificationStore.markAsRead(notification.id)"
                    >
                        <Check :size="14" />
                    </div>
                </button>
            </div>
        </div>
    </div>
</template>
