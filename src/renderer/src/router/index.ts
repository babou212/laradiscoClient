import { createRouter, createWebHashHistory } from 'vue-router';
import { startPresenceUpdater, stopPresenceUpdater } from '@/composables/usePresenceUpdater';
import { initEcho, disconnectEcho } from '@/lib/echo';
import { useAuthStore } from '@/stores/auth';
import { useE2eeStore } from '@/stores/e2ee';
import { useNotificationsStore } from '@/stores/notifications';
import { usePresenceStore } from '@/stores/presence';
import { useServerStore } from '@/stores/server';

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
                    path: 'security',
                    name: 'settings-security',
                    component: () => import('@/views/settings/SecuritySettingsView.vue'),
                },
            ],
        },
        {
            path: '/e2ee-setup',
            name: 'e2ee-setup',
            component: () => import('@/components/e2ee/E2EESetupWizard.vue'),
            meta: { requiresAuth: true },
        },
    ],
});

let appInitialized = false;
let realtimeConnected = false;

function connectRealtime(userId: number): void {
    if (realtimeConnected) return;
    realtimeConnected = true;

    initEcho();

    const presenceStore = usePresenceStore();
    const notificationsStore = useNotificationsStore();

    presenceStore.connect();
    notificationsStore.connect(userId);
    startPresenceUpdater();
}

function disconnectRealtime(): void {
    if (!realtimeConnected) return;
    realtimeConnected = false;

    const presenceStore = usePresenceStore();
    const notificationsStore = useNotificationsStore();

    presenceStore.goOffline();
    stopPresenceUpdater();

    notificationsStore.disconnect();
    presenceStore.disconnect();
    disconnectEcho();
}

router.beforeEach(async (to) => {
    const serverStore = useServerStore();
    const authStore = useAuthStore();

    if (!appInitialized) {
        appInitialized = true;
        await serverStore.loadActiveServer();
        await serverStore.loadAllServers();

        if (serverStore.isConnected) {
            await serverStore.pingServer(serverStore.activeHost!).catch(() => {});
            const sessionRestored = await authStore.restoreSession();
            if (sessionRestored && to.name === 'server-connect') {
                return { name: 'home' };
            }
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
            connectRealtime(authStore.user.id);

            const e2eeStore = useE2eeStore();
            if (!e2eeStore.isReady && !e2eeStore.isSettingUp) {
                await e2eeStore.initialize();
            }
            if (e2eeStore.needsSetup && to.name !== 'e2ee-setup') {
                return { name: 'e2ee-setup' };
            }
        }
    }

    if (!to.meta.requiresAuth && realtimeConnected) {
        disconnectRealtime();
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
});

export default router;
