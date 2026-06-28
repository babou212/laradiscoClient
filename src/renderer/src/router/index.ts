import { createRouter, createWebHashHistory } from 'vue-router';
import { startActivityReporter, stopActivityReporter } from '@/composables/useActivityReporter';
import { startPresenceUpdater, stopPresenceUpdater } from '@/composables/usePresenceUpdater';
import { initEcho, disconnectEcho } from '@/lib/echo';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import { useInboxStore } from '@/stores/inbox';
import { useNotificationsStore } from '@/stores/notifications';
import { usePresenceStore } from '@/stores/presence';
import { useServerStore } from '@/stores/server';
import { useUsersStore } from '@/stores/users';

const router = createRouter({
    history: createWebHashHistory(),
    scrollBehavior() {
        return false;
    },
    routes: [
        {
            path: '/server-connect',
            name: 'server-connect',
            component: () => import('@/views/ServerConnectView.vue'),
        },
        {
            path: '/login',
            name: 'login',
            component: () => import('@/views/LoginView.vue'),
            meta: { requiresServer: true },
        },
        {
            path: '/register',
            name: 'register',
            component: () => import('@/views/auth/RegisterView.vue'),
            meta: { requiresServer: true },
        },
        {
            path: '/forgot-password',
            name: 'forgot-password',
            component: () => import('@/views/auth/ForgotPasswordView.vue'),
            meta: { requiresServer: true },
        },
        {
            path: '/two-factor-challenge',
            name: 'two-factor-challenge',
            component: () => import('@/views/auth/TwoFactorChallengeView.vue'),
            meta: { requiresServer: true },
        },
        {
            path: '/banned',
            name: 'banned',
            component: () => import('@/views/auth/BannedView.vue'),
            meta: { requiresServer: true },
        },
        {
            path: '/',
            name: 'home',
            component: () => import('@/views/HomeView.vue'),
            meta: { requiresAuth: true },
        },
        {
            path: '/channels/:channelId',
            name: 'chat',
            component: () => import('@/views/ChatView.vue'),
            meta: { requiresAuth: true },
        },
        {
            path: '/direct-messages/:threadId?',
            name: 'direct-messages',
            component: () => import('@/views/DirectMessagesView.vue'),
            meta: { requiresAuth: true },
        },

        {
            path: '/settings',
            component: () => import('@/layouts/SettingsLayout.vue'),
            meta: { requiresAuth: true },
            redirect: { name: 'settings-profile' },
            children: [
                {
                    path: 'profile',
                    name: 'settings-profile',
                    component: () => import('@/views/settings/ProfileSettingsView.vue'),
                },
                {
                    path: 'password',
                    name: 'settings-password',
                    component: () => import('@/views/settings/PasswordSettingsView.vue'),
                },
                {
                    path: 'appearance',
                    name: 'settings-appearance',
                    component: () => import('@/views/settings/AppearanceSettingsView.vue'),
                },
                {
                    path: 'notifications',
                    name: 'settings-notifications',
                    component: () => import('@/views/settings/NotificationSettingsView.vue'),
                },
                {
                    path: 'privacy',
                    name: 'settings-privacy',
                    component: () => import('@/views/settings/PrivacySettingsView.vue'),
                },
                {
                    path: 'language',
                    name: 'settings-language',
                    component: () => import('@/views/settings/LanguageSettingsView.vue'),
                },
                {
                    path: 'voice',
                    name: 'settings-voice',
                    component: () => import('@/views/settings/VoiceSettingsView.vue'),
                },
                {
                    path: 'screen-share',
                    name: 'settings-screen-share',
                    component: () => import('@/views/settings/ScreenShareSettingsView.vue'),
                },
                {
                    path: 'two-factor',
                    name: 'settings-two-factor',
                    component: () => import('@/views/settings/TwoFactorSettingsView.vue'),
                },
                {
                    path: 'channels',
                    name: 'settings-channels',
                    component: () => import('@/views/settings/ChannelSettingsView.vue'),
                },
                {
                    path: 'members',
                    name: 'settings-members',
                    component: () => import('@/views/settings/MemberSettingsView.vue'),
                },
                {
                    path: 'roles',
                    name: 'settings-roles',
                    component: () => import('@/views/settings/RoleSettingsView.vue'),
                },
                {
                    path: 'invite-links',
                    name: 'settings-invite-links',
                    component: () => import('@/views/settings/InviteLinkSettingsView.vue'),
                },
                {
                    path: 'moderation',
                    name: 'settings-moderation',
                    component: () => import('@/views/settings/ModerationSettingsView.vue'),
                },
                {
                    path: 'audit-log',
                    name: 'settings-audit-log',
                    component: () => import('@/views/settings/AuditLogSettingsView.vue'),
                },
                {
                    path: 'about',
                    name: 'settings-about',
                    component: () => import('@/views/settings/AboutSettingsView.vue'),
                },
                {
                    path: 'logs',
                    name: 'settings-logs',
                    component: () => import('@/views/settings/LoggingSettingsView.vue'),
                },
            ],
        },
        {
            path: '/:pathMatch(.*)*',
            name: 'not-found',
            redirect: { name: 'home' },
        },
    ],
});

let appInitialized = false;
let realtimeConnected = false;

function connectRealtime(userId: number): void {
    if (realtimeConnected) return;
    realtimeConnected = true;

    initEcho();

    const usersStore = useUsersStore();
    const presenceStore = usePresenceStore();
    const notificationsStore = useNotificationsStore();
    const chatStore = useChatStore();

    void usersStore.connect(String(userId));
    void presenceStore.connect();
    notificationsStore.connect(userId);
    chatStore.connectUnread(userId);
    // Pull any messages buffered while we were offline (the reconnect path is
    // handled by the Echo 'connected' handler in lib/echo.ts).
    void useInboxStore().drain();
    startPresenceUpdater();
    void startActivityReporter();
}

function disconnectRealtime(): void {
    if (!realtimeConnected) return;
    realtimeConnected = false;

    const usersStore = useUsersStore();
    const presenceStore = usePresenceStore();
    const notificationsStore = useNotificationsStore();
    const chatStore = useChatStore();

    presenceStore.goOffline();
    stopPresenceUpdater();
    stopActivityReporter();

    chatStore.disconnectUnread();
    notificationsStore.disconnect();
    presenceStore.disconnect();
    usersStore.disconnect();
    disconnectEcho();
}

router.beforeEach(async (to) => {
    const serverStore = useServerStore();
    const authStore = useAuthStore();

    if (!appInitialized) {
        appInitialized = true;
        try {
            await serverStore.loadActiveServer();
            await serverStore.loadAllServers();

            if (serverStore.isConnected) {
                await serverStore.pingServer(serverStore.activeHost!).catch(() => {});
                const sessionRestored = await authStore.restoreSession();
                if (sessionRestored && to.name === 'server-connect') {
                    return { name: 'home' };
                }
            }
        } catch (error) {
            console.error('App initialization failed:', error);
        }
    }

    if (to.meta.requiresAuth) {
        if (!serverStore.isConnected) {
            return { name: 'server-connect' };
        }
        if (!authStore.isAuthenticated) {
            disconnectRealtime();
            return { name: 'login' };
        }
        if (authStore.user) {
            connectRealtime(Number(authStore.user.id));
        }
    }

    if (to.meta.requiresServer && !serverStore.isConnected) {
        return { name: 'server-connect' };
    }

    if (to.name === 'login' && authStore.isAuthenticated) {
        return { name: 'home' };
    }

    if (to.name === 'server-connect' && serverStore.isConnected && authStore.isAuthenticated) {
        return { name: 'home' };
    }

    if (!to.meta.requiresAuth && realtimeConnected) {
        disconnectRealtime();
    }
});

export default router;
