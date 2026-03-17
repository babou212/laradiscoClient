import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { useAuthStore } from '@/stores/auth';
import { useServerStore } from '@/stores/server';

(window as unknown as Record<string, unknown>).Pusher = Pusher;

let echoInstance: Echo<'reverb'> | null = null;
let currentConfigKey = '';

function resolveReverbConfig() {
    const serverStore = useServerStore();
    const host = serverStore.activeHost ?? 'localhost';

    if (serverStore.reverbConfig) {
        const rc = serverStore.reverbConfig;
        const forceTLS = rc.scheme === 'https';
        return {
            key: rc.key,
            host: rc.host,
            port: rc.port,
            forceTLS,
        };
    }

    const isHttps = host.startsWith('https://');
    const cleanHost = host.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const hostname = cleanHost.split(':')[0];
    const isLocal =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname === '::1' ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.test');
    const forceTLS = isHttps || (!isLocal && !host.startsWith('http://'));

    const key = import.meta.env.VITE_REVERB_APP_KEY || 'laradisco-key';
    const port = forceTLS ? 443 : 80;

    return { key, host: hostname, port, forceTLS };
}

function buildConfigKey(): string {
    const config = resolveReverbConfig();
    const authStore = useAuthStore();
    return `${config.key}:${config.host}:${config.port}:${config.forceTLS}:${authStore.token}`;
}

export function initEcho(): Echo<'reverb'> {
    const newKey = buildConfigKey();

    if (echoInstance && newKey === currentConfigKey) {
        return echoInstance;
    }

    if (echoInstance) {
        try {
            echoInstance.disconnect();
        } catch (error) {
            console.error(error);
        }
        echoInstance = null;
    }

    const config = resolveReverbConfig();
    const authStore = useAuthStore();
    const serverStore = useServerStore();

    const baseUrl = serverStore.activeHost
        ? (serverStore.activeHost.startsWith('http')
              ? serverStore.activeHost
              : `${config.forceTLS ? 'https' : 'http'}://${config.host}`
          ).replace(/\/+$/, '')
        : '';

    echoInstance = new Echo({
        broadcaster: 'reverb',
        key: config.key,
        wsHost: config.host,
        wsPort: config.forceTLS ? undefined : config.port,
        wssPort: config.forceTLS ? config.port : undefined,
        forceTLS: config.forceTLS,
        enabledTransports: ['ws', 'wss'],
        disableStats: true,
        authEndpoint: `${baseUrl}/api/v1/broadcasting/auth`,
        auth: {
            headers: {
                Authorization: `Bearer ${authStore.token}`,
                Accept: 'application/json',
            },
        },

        enableLogging: false,
        activityTimeout: 30000,
        pongTimeout: 10000,
    });

    currentConfigKey = newKey;

    const connector = echoInstance.connector as unknown as { pusher: Pusher };
    if (connector?.pusher) {
        const pusher = connector.pusher;
        pusher.connection.bind('connected', () => {
            console.log('[Echo] WebSocket connected');
        });
        pusher.connection.bind('disconnected', () => {
            console.warn('[Echo] WebSocket disconnected — will auto-reconnect');
        });
        pusher.connection.bind('error', (err: unknown) => {
            console.error('[Echo] WebSocket error:', err);
        });
    }

    return echoInstance;
}

export function getEcho(): Echo<'reverb'> {
    if (!echoInstance) {
        return initEcho();
    }
    return echoInstance;
}

export function isEchoConnected(): boolean {
    return echoInstance !== null;
}

export function disconnectEcho(): void {
    if (echoInstance) {
        try {
            echoInstance.disconnect();
        } catch (error) {
            console.error(error);
        }
        echoInstance = null;
        currentConfigKey = '';
    }
}

export default { initEcho, getEcho, isEchoConnected, disconnectEcho };
