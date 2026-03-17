import axios from 'axios';
import { useAuthStore } from '@/stores/auth';
import { useE2eeStore } from '@/stores/e2ee';
import { useServerStore } from '@/stores/server';

function buildBaseUrl(host: string): string {
    if (host.startsWith('http://') || host.startsWith('https://')) {
        return host.replace(/\/+$/, '');
    }
    const hostname = host.split(':')[0];
    const isLocal =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname === '::1' ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.test');
    return `${isLocal ? 'http' : 'https'}://${host}`;
}

const api = axios.create({
    headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
    },
    timeout: 15_000,
});

api.interceptors.request.use(async (config) => {
    const serverStore = useServerStore();
    const authStore = useAuthStore();

    if (serverStore.activeHost) {
        config.baseURL = `${buildBaseUrl(serverStore.activeHost)}/api/v1`;
    }

    if (authStore.token) {
        config.headers.Authorization = `Bearer ${authStore.token}`;
    }

    const e2eeStore = useE2eeStore();
    if (e2eeStore.deviceId) {
        config.headers['X-Device-Id'] = e2eeStore.deviceId;
    }

    return config;
});

api.interceptors.response.use(
    (response) => {
        const body = response.data;
        if (body && typeof body === 'object' && !Array.isArray(body) && 'data' in body) {
            response.data = body.data;
        }
        return response;
    },
    async (error) => {
        if (error.response?.status === 401) {
            const authStore = useAuthStore();
            await authStore.logout();

            const { default: router } = await import('@/router');
            router.push({ name: 'login' });
        }
        return Promise.reject(error);
    },
);

export default api;
