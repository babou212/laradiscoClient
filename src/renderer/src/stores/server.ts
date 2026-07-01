import { acceptHMRUpdate, defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
    getServerSettings,
    uploadServerLogo,
    deleteServerLogo,
    type ServerSettings,
} from '@/api/settings';

export interface ReverbConfig {
    key: string;
    host: string;
    port: number;
    scheme: string;
}

export interface ServerConnection {
    id: number;
    name: string;
    host: string;
    is_active: boolean;
    created_at: string;
}

export const useServerStore = defineStore('server', () => {
    const activeServer = ref<ServerConnection | null>(null);
    const servers = ref<ServerConnection[]>([]);
    const isConnecting = ref(false);
    const connectionError = ref<string | null>(null);
    const reverbConfig = ref<ReverbConfig | null>(null);

    const isConnected = computed(() => !!activeServer.value);
    const activeHost = computed(() => activeServer.value?.host ?? null);

    const serverLogoUrls = ref<ServerSettings['logo_urls']>(null);
    const afkChannelId = ref<number | null>(null);
    const afkTimeout = ref<number>(5);

    async function loadActiveServer(): Promise<void> {
        activeServer.value = await window.api.server.getActive();
    }

    async function loadAllServers(): Promise<void> {
        servers.value = await window.api.server.getAll();
    }

    async function pingServer(
        host: string,
    ): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
        isConnecting.value = true;
        connectionError.value = null;

        try {
            const result = await window.api.server.ping(host);
            if (!result.success) {
                connectionError.value = result.error ?? 'Connection failed';
            } else if (result.data?.reverb) {
                reverbConfig.value = result.data.reverb as ReverbConfig;
            }
            return result;
        } catch {
            connectionError.value = 'Unexpected error connecting to server';
            return { success: false, error: connectionError.value };
        } finally {
            isConnecting.value = false;
        }
    }

    async function saveConnection(name: string, host: string): Promise<ServerConnection | null> {
        const result = await window.api.server.save(name, host);
        if (result.success && result.connection) {
            activeServer.value = result.connection;
            await loadAllServers();
            return result.connection;
        }
        return null;
    }

    async function switchServer(id: number): Promise<void> {
        await window.api.server.setActive(id);
        await loadActiveServer();
    }

    async function removeServer(id: number): Promise<void> {
        await window.api.server.remove(id);
        if (activeServer.value?.id === id) {
            activeServer.value = null;
        }
        await loadAllServers();
    }

    async function loadServerSettings(): Promise<void> {
        try {
            const s = await getServerSettings();
            serverLogoUrls.value = s.logo_urls;
            afkChannelId.value = s.afk_channel_id;
            afkTimeout.value = s.afk_timeout;
        } catch {
            // non-fatal — sidebar renders with initials fallback
        }
    }

    async function uploadLogo(blob: Blob): Promise<void> {
        const result = await uploadServerLogo(blob);
        serverLogoUrls.value = result.logo_urls;
    }

    async function removeLogo(): Promise<void> {
        await deleteServerLogo();
        serverLogoUrls.value = null;
        void window.api?.avatar?.forget('0').catch(() => {});
    }

    function clearError(): void {
        connectionError.value = null;
    }

    function $reset(): void {
        activeServer.value = null;
        servers.value = [];
        isConnecting.value = false;
        connectionError.value = null;
        reverbConfig.value = null;
        serverLogoUrls.value = null;
        afkChannelId.value = null;
        afkTimeout.value = 5;
    }

    return {
        activeServer,
        servers,
        isConnecting,
        connectionError,
        isConnected,
        activeHost,
        reverbConfig,
        serverLogoUrls,
        afkChannelId,
        afkTimeout,
        loadActiveServer,
        loadAllServers,
        loadServerSettings,
        uploadLogo,
        removeLogo,
        pingServer,
        saveConnection,
        switchServer,
        removeServer,
        clearError,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useServerStore, import.meta.hot));
}
