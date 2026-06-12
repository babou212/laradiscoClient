import * as Sentry from '@sentry/electron/renderer';
import axios from 'axios';
import { getSocketId } from '@/lib/echo';
import { useAuthStore } from '@/stores/auth';
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
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
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

    // Identify our websocket connection so the server's broadcast(...)->toOthers()
    // excludes this client and we don't receive (and duplicate) our own messages.
    const socketId = getSocketId();
    if (socketId) {
        config.headers['X-Socket-ID'] = socketId;
    }

    return config;
});

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.config) {
            Sentry.addBreadcrumb({
                category: 'http',
                message: `${error.config.method?.toUpperCase()} ${error.config.url}`,
                level: 'error',
                data: {
                    status: error.response?.status,
                    url: error.config.url,
                    method: error.config.method,
                },
            });
        }

        if (error.response?.status >= 500) {
            Sentry.withScope((scope) => {
                scope.setTag('http.status_code', error.response.status);
                scope.setTag('http.method', error.config?.method?.toUpperCase());
                scope.setContext('request', {
                    url: error.config?.url,
                    method: error.config?.method,
                    baseURL: error.config?.baseURL,
                });
                scope.setFingerprint(['http-error', String(error.response.status), error.config?.url ?? 'unknown']);
                Sentry.captureException(error);
            });
        }

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
