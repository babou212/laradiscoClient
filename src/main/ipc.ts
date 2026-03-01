import { ipcMain, net } from 'electron';
import {
    addServerConnection,
    getActiveServer,
    getAllServers,
    getAuthSession,
    removeAuthSession,
    removeServer,
    saveAuthSession,
    setActiveServer,
} from './database';

/**
 * Build a full URL from a host string.
 * Supports inputs like:
 *   - "localhost"          → "http://localhost"
 *   - "localhost:8000"     → "http://localhost:8000"
 *   - "127.0.0.1:8000"    → "http://127.0.0.1:8000"
 *   - "chat.example.com"  → "https://chat.example.com"
 *   - "http://..."        → kept as-is
 *   - "https://..."       → kept as-is
 */
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

    const protocol = isLocal ? 'http' : 'https';
    return `${protocol}://${host}`;
}

export function registerIpcHandlers(): void {

    /**
     * Test connectivity to a server by hitting its /api/ping endpoint.
     * Returns the server info on success, or an error message.
     */
    ipcMain.handle('server:ping', async (_event, host: string) => {
        const url = `${buildBaseUrl(host)}/api/ping`;
        try {
            const response = await net.fetch(url, {
                method: 'GET',
                headers: { Accept: 'application/json' },
            });

            if (!response.ok) {
                return { success: false, error: `Server returned ${response.status}` };
            }

            const data = await response.json();
            return { success: true, data };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Connection failed';
            return { success: false, error: message };
        }
    });

    /**
     * Save a successful server connection to the local database.
     */
    ipcMain.handle('server:save', async (_event, name: string, host: string) => {
        try {
            const connection = addServerConnection(name, host);
            return { success: true, connection };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to save connection';
            return { success: false, error: message };
        }
    });

    ipcMain.handle('server:getActive', async () => {
        return getActiveServer();
    });

    ipcMain.handle('server:getAll', async () => {
        return getAllServers();
    });

    ipcMain.handle('server:setActive', async (_event, id: number) => {
        setActiveServer(id);
        return { success: true };
    });

    ipcMain.handle('server:remove', async (_event, id: number) => {
        removeServer(id);
        return { success: true };
    });

    /**
     * Login to the server and store the token locally.
     */
    ipcMain.handle(
        'auth:login',
        async (_event, host: string, serverId: number, email: string, password: string) => {
            const url = `${buildBaseUrl(host)}/api/auth/login`;
            try {
                const response = await net.fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                    body: JSON.stringify({
                        email,
                        password,
                        device_name: `LaraDisco Desktop (${process.platform})`,
                    }),
                });

                const data = await response.json();

                if (!response.ok) {
                    return {
                        success: false,
                        error: data.message || data.errors?.email?.[0] || 'Login failed',
                    };
                }

                // Save encrypted token locally
                saveAuthSession(
                    serverId,
                    data.user.id,
                    data.user.name,
                    data.user.email,
                    data.user.avatar_path,
                    data.token,
                );

                return { success: true, user: data.user, token: data.token };
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Login failed';
                return { success: false, error: message };
            }
        },
    );

    /**
     * Retrieve the stored auth session for a server.
     */
    ipcMain.handle('auth:getSession', async (_event, serverId: number) => {
        return getAuthSession(serverId);
    });

    /**
     * Logout: revoke the token on the server and remove locally.
     */
    ipcMain.handle('auth:logout', async (_event, host: string, serverId: number) => {
        const session = getAuthSession(serverId);
        if (session) {
            try {
                await net.fetch(`${buildBaseUrl(host)}/api/auth/logout`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${session.token}`,
                        Accept: 'application/json',
                    },
                });
            } catch {
                // Server may be unreachable — still remove local session
            }
            removeAuthSession(serverId);
        }
        return { success: true };
    });

    /**
     * Validate that a stored token is still valid.
     */
    ipcMain.handle('auth:validate', async (_event, host: string, token: string) => {
        try {
            const response = await net.fetch(`${buildBaseUrl(host)}/api/auth/user`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                },
            });

            if (!response.ok) {
                return { valid: false };
            }

            const user = await response.json();
            return { valid: true, user };
        } catch {
            return { valid: false };
        }
    });
}
