import { defineStore } from 'pinia';
import { ref } from 'vue';
import router from '@/router';
import { getEcho } from '@/lib/echo';
import api from '@/lib/api';

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
        notification_type?: 'direct_message';
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
}

const PREFERENCES_STORAGE_KEY = 'notification_preferences';

const defaultPreferences: NotificationPreferences = {
    enable_toast_notifications: true,
    enable_browser_notifications: true,
    enable_dm_notifications: true,
    enable_mention_notifications: true,
};

function loadPreferences(): NotificationPreferences {
    try {
        const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY);
        if (stored) {
            return { ...defaultPreferences, ...JSON.parse(stored) };
        }
    } catch {
        // ignore parse errors
    }
    return { ...defaultPreferences };
}

export function savePreferences(prefs: NotificationPreferences): void {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
}

export const useNotificationsStore = defineStore('notifications', () => {
    const notifications = ref<AppNotification[]>([]);
    const unreadCount = ref(0);
    const toasts = ref<ToastNotification[]>([]);
    const isConnected = ref(false);
    const preferences = ref<NotificationPreferences>(loadPreferences());

    let userId: number | null = null;
    let nativeClickListenerRegistered = false;

    const fetchNotifications = async () => {
        try {
            const { data } = await api.get('/notifications');
            notifications.value = data.notifications;
            unreadCount.value = data.unread_count;
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
        echo.private(`App.Models.User.${currentUserId}`).notification(
            (raw: Record<string, unknown>) => {
                const notification: AppNotification = {
                    id: raw.id as string,
                    type:
                        typeof raw.type === 'string'
                            ? raw.type.split('\\').pop()!
                            : String(raw.type),
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
                        notification_type: raw.notification_type as 'direct_message' | undefined,
                    },
                    read_at: null,
                    created_at: new Date().toISOString(),
                };

                notifications.value.unshift(notification);
                unreadCount.value++;

                const prefs = preferences.value;
                const isDm = notification.data.notification_type === 'direct_message';

                if (isDm && !prefs.enable_dm_notifications) return;
                if (!isDm && !prefs.enable_mention_notifications) return;

                if (prefs.enable_browser_notifications) {
                    showNativeNotification(notification);
                }

                if (prefs.enable_toast_notifications) {
                    addToast(notification);
                }
            },
        );

        isConnected.value = true;
        fetchNotifications();
        fetchPreferences();
        setupNativeClickListener();
    };

    const setupNativeClickListener = () => {
        if (nativeClickListenerRegistered) return;
        nativeClickListenerRegistered = true;

        window.api.notifications.onClicked((notificationId: string) => {
            const notification = notifications.value.find((n) => n.id === notificationId);
            if (!notification) return;

            markAsRead(notificationId);

            if (notification.data.notification_type === 'direct_message') {
                router.push({ name: 'direct-messages', params: { threadId: notification.data.dm_group_id } });
            } else if (notification.data.channel_id) {
                router.push({ name: 'chat', params: { channelId: notification.data.channel_id } });
            }
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
            const { data } = await api.patch(`/notifications/${notificationId}`, { read: true });
            notifications.value = notifications.value.filter((n) => n.id !== notificationId);
            unreadCount.value = data.unread_count;
        } catch (err) {
            console.error('Failed to mark notification as read:', err);
        }
    };

    const markAllAsRead = async () => {
        try {
            await api.patch('/notifications', { read: true });
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
            title = `Message from ${data.sender_username}`;
        } else {
            const mentionLabel =
                data.mention_type === 'everyone'
                    ? '@everyone'
                    : data.mention_type === 'here'
                      ? '@here'
                      : `@${data.sender_username}`;
            title = `${mentionLabel} in #${data.channel_name}`;
        }

        const body = `${data.sender_username}: ${data.content.substring(0, 100)}`;

        window.api.notifications.show({ title, body, notificationId: notification.id });
    };

    const disconnect = () => {
        if (userId) {
            try {
                const echo = getEcho();
                echo.leave(`App.Models.User.${userId}`);
            } catch {
                // Echo may already be disconnected
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
    };
});
