import { createRouter, createWebHashHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useServerStore } from '@/stores/server';

const router = createRouter({
    history: createWebHashHistory(),
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
            path: '/reset-password',
            name: 'reset-password',
            component: () => import('@/views/auth/ResetPasswordView.vue'),
            meta: { requiresServer: true },
        },
        {
            path: '/two-factor-challenge',
            name: 'two-factor-challenge',
            component: () => import('@/views/auth/TwoFactorChallengeView.vue'),
            meta: { requiresServer: true },
        },
        {
            path: '/setup',
            name: 'setup',
            component: () => import('@/views/auth/SetupView.vue'),
            meta: { requiresServer: true },
        },

        // ── Authenticated app routes ──────────────────────────────
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
            meta: { requiresAuth: true },
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
            ],
        },
    ],
});

let appInitialized = false;

router.beforeEach(async (to) => {
    const serverStore = useServerStore();
    const authStore = useAuthStore();

    if (!appInitialized) {
        appInitialized = true;
        await serverStore.loadActiveServer();
        await serverStore.loadAllServers();

        if (serverStore.isConnected) {
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
            return { name: 'login' };
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
});

export default router;
