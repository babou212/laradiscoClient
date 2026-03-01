import axios from 'axios';
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

/**
 * Create a pre-configured axios instance that automatically sets the
 * base URL from the active server and attaches the auth token.
 */
const api = axios.create({
    headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
    },
    timeout: 15_000,
});

// Dynamically set baseURL and Authorization header on every request
api.interceptors.request.use((config) => {
    const serverStore = useServerStore();
    const authStore = useAuthStore();

    if (serverStore.activeHost) {
        config.baseURL = `${buildBaseUrl(serverStore.activeHost)}/api`;
    }

    if (authStore.token) {
        config.headers.Authorization = `Bearer ${authStore.token}`;
    }

    return config;
});

// Handle 401 responses — token expired/revoked
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.response?.status === 401) {
            const authStore = useAuthStore();
            await authStore.logout();
            // Router will redirect to login via navigation guard
            window.location.hash = '#/login';
        }
        return Promise.reject(error);
    },
);

export default api;
