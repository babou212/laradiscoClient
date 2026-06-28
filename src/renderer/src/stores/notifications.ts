import { acceptHMRUpdate, defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { ackInbox } from '@/api/inbox';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '@/api/notifications';
import { t } from '@/i18n';
import { getEcho } from '@/lib/echo';
import router from '@/router';
import { useChatStore } from '@/stores/chat';
import { useThreadStore } from '@/stores/thread';

export interface AppNotification {
    id: string;
    type: string;
    data: {
        message_id: number;
        sender_id: number;
        sender_username: string;
        sender_avatar: string | null;
        content: string;

        channel_id?: number;
        channel_name?: string;
        mention_type?: 'user' | 'everyone' | 'here';

        dm_group_id?: number;
        dm_group_name?: string | null;
        notification_type?: 'direct_message' | 'thread_reply';

        thread_id?: number;
        thread_name?: string;
    };
    read_at: string | null;
    created_at: string;
}

export interface ToastNotification extends AppNotification {
    dismissing?: boolean;
}

export interface NotificationPreferences {
    enable_toast_notifications: boolean;
    enable_browser_notifications: boolean;
    enable_dm_notifications: boolean;
    enable_mention_notifications: boolean;
    enable_thread_notifications: boolean;
}

const PREFERENCES_STORAGE_KEY = 'notification_preferences';

const defaultPreferences: NotificationPreferences = {
    enable_toast_notifications: true,
    enable_browser_notifications: true,
    enable_dm_notifications: true,
    enable_mention_notifications: true,
    enable_thread_notifications: true,
};

function loadPreferences(): NotificationPreferences {
    try {
        const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY);
        if (stored) {
            return { ...defaultPreferences, ...JSON.parse(stored) };
        }
    } catch (error) {
        console.error(error);
    }
    return { ...defaultPreferences };
}

export function savePreferences(prefs: NotificationPreferences): void {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
}

export async function navigateToNotification(notification: AppNotification): Promise<void> {
    const { data } = notification;

    if (data.notification_type === 'direct_message') {
        await router.push({ name: 'direct-messages', params: { threadId: data.dm_group_id } });
        return;
    }

    if (data.channel_id == null) return;

    await useChatStore().selectChannel(data.channel_id);
    await router.push({ name: 'home' });

    if (data.notification_type === 'thread_reply' && data.thread_id != null) {
        await useThreadStore().openThreadById(data.channel_id, data.thread_id);
    }
}

export const useNotificationsStore = defineStore('notifications', () => {
    const notifications = ref<AppNotification[]>([]);
    const unreadCount = ref(0);
    const toasts = ref<ToastNotification[]>([]);
    const isConnected = ref(false);
    const preferences = ref<NotificationPreferences>(loadPreferences());

    watch(unreadCount, (count) => {
        window.api.tray.updateUnreadCount(count);
    });

    let userId: number | null = null;
    let nativeClickListenerRegistered = false;

    const fetchNotifications = async () => {
        try {
            const response = await getNotifications();
            notifications.value = response.data.map((r) => ({
                id: r.id,
                type: r.attributes.notification_type,
                data: r.attributes.data as AppNotification['data'],
                read_at: r.attributes.read_at,
                created_at: r.attributes.created_at,
            }));
            unreadCount.value = response.meta?.unread_count ?? notifications.value.length;
        } catch (err) {
            console.error('Failed to fetch notifications:', err);
        }
    };

    const fetchPreferences = () => {
        preferences.value = loadPreferences();
    };

    const connect = (currentUserId: number) => {
        if (isConnected.value && userId === currentUserId) return;

        userId = currentUserId;

        const echo = getEcho();
        const userChannel = echo.private(`App.Models.User.${currentUserId}`);
        userChannel.notification((raw: Record<string, unknown>) => {
            const notification: AppNotification = {
                id: raw.id as string,
                type: typeof raw.type === 'string' ? raw.type.split('\\').pop()! : String(raw.type),
                data: {
                    message_id: raw.message_id as number,
                    sender_id: raw.sender_id as number,
                    sender_username: raw.sender_username as string,
                    sender_avatar: (raw.sender_avatar as string | null) ?? null,
                    content: raw.content as string,
                    channel_id: raw.channel_id as number | undefined,
                    channel_name: raw.channel_name as string | undefined,
                    mention_type: raw.mention_type as 'user' | 'everyone' | 'here' | undefined,
                    dm_group_id: raw.dm_group_id as number | undefined,
                    dm_group_name: raw.dm_group_name as string | null | undefined,
                    notification_type: raw.notification_type as 'direct_message' | 'thread_reply' | undefined,
                    thread_id: raw.thread_id as number | undefined,
                    thread_name: raw.thread_name as string | undefined,
                },
                read_at: null,
                created_at: new Date().toISOString(),
            };

            notifications.value.unshift(notification);
            unreadCount.value++;

            if (notification.data.notification_type === 'direct_message') {
                void ackInbox([{ message_type: 'direct_message', message_id: notification.data.message_id }]);
            } else if (notification.data.mention_type === 'user' && notification.data.channel_id != null) {
                void ackInbox([{ message_type: 'channel', message_id: notification.data.message_id }]);
            }

            const prefs = preferences.value;
            const isDm = notification.data.notification_type === 'direct_message';
            const isThread = notification.data.notification_type === 'thread_reply';

            if (isDm && !prefs.enable_dm_notifications) return;
            if (isThread && !prefs.enable_thread_notifications) return;
            if (!isDm && !isThread && !prefs.enable_mention_notifications) return;

            if (prefs.enable_browser_notifications) {
                showNativeNotification(notification);
            }

            if (prefs.enable_toast_notifications) {
                addToast(notification);
            }
        });

        userChannel.listen(
            '.user.banned',
            (data: { reason?: string | null; expires_at?: string | null; permanent?: boolean }) => {
                void handleBanned(data);
            },
        );

        isConnected.value = true;
        fetchNotifications();
        fetchPreferences();
        setupNativeClickListener();
    };

    const handleBanned = async (data: {
        reason?: string | null;
        expires_at?: string | null;
        permanent?: boolean;
    }): Promise<void> => {
        // Lazy imports avoid a circular dependency (auth/voice -> api -> ... -> notifications).
        const { useAuthStore } = await import('@/stores/auth');
        const { useVoiceStore } = await import('@/stores/voice');

        useAuthStore().banInfo = {
            reason: data.reason ?? null,
            expires_at: data.expires_at ?? null,
            permanent: data.permanent ?? data.expires_at == null,
        };

        try {
            await useVoiceStore().leaveChannel();
        } catch (err) {
            console.warn('[Ban] Failed to leave voice on ban:', err);
        }

        await useAuthStore().logout();
        void router.push({ name: 'banned' });
    };

    const setupNativeClickListener = () => {
        if (nativeClickListenerRegistered) return;
        nativeClickListenerRegistered = true;

        window.api.notifications.onClicked((notificationId: string) => {
            const notification = notifications.value.find((n) => n.id === notificationId);
            if (!notification) return;

            markAsRead(notificationId);
            void navigateToNotification(notification);
        });
    };

    const addToast = (notification: AppNotification) => {
        const toast: ToastNotification = { ...notification, dismissing: false };
        toasts.value.push(toast);

        setTimeout(() => {
            dismissToast(notification.id);
        }, 5000);
    };

    const dismissToast = (notificationId: string) => {
        const index = toasts.value.findIndex((t) => t.id === notificationId);
        if (index !== -1) {
            toasts.value[index].dismissing = true;
            setTimeout(() => {
                toasts.value = toasts.value.filter((t) => t.id !== notificationId);
            }, 300);
        }
    };

    const markAsRead = async (notificationId: string) => {
        try {
            const result = await markNotificationRead(notificationId);
            notifications.value = notifications.value.filter((n) => n.id !== notificationId);
            unreadCount.value = result.meta.unread_count;
        } catch (err) {
            console.error('Failed to mark notification as read:', err);
        }
    };

    const markAllAsRead = async () => {
        try {
            await markAllNotificationsRead();
            notifications.value = [];
            unreadCount.value = 0;
        } catch (err) {
            console.error('Failed to mark all notifications as read:', err);
        }
    };

    const showNativeNotification = (notification: AppNotification) => {
        const { data } = notification;
        let title: string;

        if (data.notification_type === 'direct_message') {
            title = t('notifications.messageFrom', { user: data.sender_username });
        } else if (data.notification_type === 'thread_reply') {
            title = t('notifications.threadReply', {
                user: data.sender_username,
                thread: data.thread_name ?? '',
            });
        } else {
            const mentionLabel =
                data.mention_type === 'everyone'
                    ? t('notifications.mentionEveryone')
                    : data.mention_type === 'here'
                      ? t('notifications.mentionHere')
                      : t('notifications.mentionUser', { user: data.sender_username });
            title = t('notifications.mentionInChannel', {
                mention: mentionLabel,
                channel: data.channel_name ?? '',
            });
        }

        const body = data.content ? `${data.sender_username}: ${data.content.substring(0, 100)}` : data.sender_username;

        window.api.notifications.show({ title, body, notificationId: notification.id });
    };

    const disconnect = () => {
        if (userId) {
            try {
                const echo = getEcho();
                echo.leave(`App.Models.User.${userId}`);
            } catch (error) {
                console.error(error);
            }
            userId = null;
            isConnected.value = false;
        }
        if (nativeClickListenerRegistered) {
            window.api.notifications.removeAllListeners();
            nativeClickListenerRegistered = false;
        }
    };

    const updatePreferences = (prefs: NotificationPreferences) => {
        preferences.value = prefs;
        savePreferences(prefs);
    };

    function $reset(): void {
        disconnect();
        notifications.value = [];
        unreadCount.value = 0;
        toasts.value = [];
        isConnected.value = false;
        preferences.value = loadPreferences();
    }

    return {
        notifications,
        unreadCount,
        toasts,
        isConnected,
        preferences,
        connect,
        disconnect,
        fetchNotifications,
        fetchPreferences,
        updatePreferences,
        markAsRead,
        markAllAsRead,
        dismissToast,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useNotificationsStore, import.meta.hot));
}
