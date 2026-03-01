import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

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

    const isConnected = computed(() => !!activeServer.value);
    const activeHost = computed(() => activeServer.value?.host ?? null);

    /**
     * Load the active server connection from local DB on app startup.
     */
    async function loadActiveServer(): Promise<void> {
        activeServer.value = await window.api.server.getActive();
    }

    /**
     * Load all saved server connections.
     */
    async function loadAllServers(): Promise<void> {
        servers.value = await window.api.server.getAll();
    }

    /**
     * Ping a server to verify connectivity.
     */
    async function pingServer(host: string): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
        isConnecting.value = true;
        connectionError.value = null;

        try {
            const result = await window.api.server.ping(host);
            if (!result.success) {
                connectionError.value = result.error ?? 'Connection failed';
            }
            return result;
        } catch {
            connectionError.value = 'Unexpected error connecting to server';
            return { success: false, error: connectionError.value };
        } finally {
            isConnecting.value = false;
        }
    }

    /**
     * Save a verified server connection.
     */
    async function saveConnection(name: string, host: string): Promise<ServerConnection | null> {
        const result = await window.api.server.save(name, host);
        if (result.success && result.connection) {
            activeServer.value = result.connection;
            await loadAllServers();
            return result.connection;
        }
        return null;
    }

    /**
     * Switch to a different saved server.
     */
    async function switchServer(id: number): Promise<void> {
        await window.api.server.setActive(id);
        await loadActiveServer();
    }

    /**
     * Remove a saved server connection.
     */
    async function removeServer(id: number): Promise<void> {
        await window.api.server.remove(id);
        if (activeServer.value?.id === id) {
            activeServer.value = null;
        }
        await loadAllServers();
    }

    function clearError(): void {
        connectionError.value = null;
    }

    return {
        activeServer,
        servers,
        isConnecting,
        connectionError,
        isConnected,
        activeHost,
        loadActiveServer,
        loadAllServers,
        pingServer,
        saveConnection,
        switchServer,
        removeServer,
        clearError,
    };
});
