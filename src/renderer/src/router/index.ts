import { createRouter, createWebHashHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useServerStore } from '@/stores/server';

const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        {
            path: '/',
            name: 'home',
            component: () => import('@/views/HomeView.vue'),
            meta: { requiresAuth: true },
        },
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
    ],
});

let appInitialized = false;

router.beforeEach(async (to) => {
    const serverStore = useServerStore();
    const authStore = useAuthStore();

    // On first navigation, load saved state from local DB
    if (!appInitialized) {
        appInitialized = true;
        await serverStore.loadActiveServer();
        await serverStore.loadAllServers();

        // If we have an active server, try to restore the auth session
        if (serverStore.isConnected) {
            const sessionRestored = await authStore.restoreSession();
            if (sessionRestored && to.name === 'server-connect') {
                return { name: 'home' };
            }
        }
    }

    // Guard: routes that require auth
    if (to.meta.requiresAuth) {
        if (!serverStore.isConnected) {
            return { name: 'server-connect' };
        }
        if (!authStore.isAuthenticated) {
            return { name: 'login' };
        }
    }

    // Guard: routes that require a server connection
    if (to.meta.requiresServer && !serverStore.isConnected) {
        return { name: 'server-connect' };
    }

    // If already authenticated and going to login, skip to home
    if (to.name === 'login' && authStore.isAuthenticated) {
        return { name: 'home' };
    }

    // If already connected and authenticated, don't show server connect
    if (to.name === 'server-connect' && serverStore.isConnected && authStore.isAuthenticated) {
        return { name: 'home' };
    }
});

export default router;
