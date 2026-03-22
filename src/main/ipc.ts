import { BrowserWindow, ipcMain, net, Notification } from 'electron';
import {
    addServerConnection,
    getActiveServer,
    getAllServers,
    getAuthSession,
    getSetting,
    removeAuthSession,
    removeServer,
    saveAuthSession,
    setActiveServer,
    setSetting,
} from './database';

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
    ipcMain.handle('server:ping', async (_event, host: string) => {
        const url = `${buildBaseUrl(host)}/api/v1/ping`;
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

    ipcMain.handle('auth:login', async (_event, host: string, serverId: number, email: string, password: string) => {
        const url = `${buildBaseUrl(host)}/api/v1/auth/login`;
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

            const body = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    error: body.message || body.errors?.email?.[0] || 'Login failed',
                };
            }

            const data = body.data;

            if (data.two_factor) {
                return {
                    success: false,
                    twoFactor: true,
                    challengeToken: data.challenge_token,
                };
            }

            saveAuthSession(serverId, data.user.id, data.user.name, data.user.email, data.user.avatar_path, data.token);

            return { success: true, user: data.user, token: data.token };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Login failed';
            return { success: false, error: message };
        }
    });

    ipcMain.handle(
        'auth:twoFactorChallenge',
        async (
            _event,
            host: string,
            serverId: number,
            challengeToken: string,
            code: string | null,
            recoveryCode: string | null,
        ) => {
            const url = `${buildBaseUrl(host)}/api/v1/auth/two-factor-challenge`;
            try {
                const response = await net.fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                    body: JSON.stringify({
                        challenge_token: challengeToken,
                        code: code,
                        recovery_code: recoveryCode,
                    }),
                });

                const body = await response.json();

                if (!response.ok) {
                    return {
                        success: false,
                        error:
                            body.message ||
                            body.errors?.code?.[0] ||
                            body.errors?.recovery_code?.[0] ||
                            'Verification failed',
                    };
                }

                const data = body.data;

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
                const message = err instanceof Error ? err.message : 'Verification failed';
                return { success: false, error: message };
            }
        },
    );

    ipcMain.handle('auth:validateInvite', async (_event, host: string, token: string) => {
        const url = `${buildBaseUrl(host)}/api/v1/auth/invite/${encodeURIComponent(token)}`;
        try {
            const response = await net.fetch(url, {
                method: 'GET',
                headers: { Accept: 'application/json' },
            });

            const body = await response.json();

            if (!response.ok) {
                return { success: false, error: body.message || 'Invalid invite link' };
            }

            return { success: true, data: body.data };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to validate invite';
            return { success: false, error: message };
        }
    });

    ipcMain.handle(
        'auth:register',
        async (
            _event,
            host: string,
            serverId: number,
            inviteToken: string,
            name: string,
            username: string,
            email: string,
            password: string,
            passwordConfirmation: string,
        ) => {
            const url = `${buildBaseUrl(host)}/api/v1/auth/register`;
            try {
                const response = await net.fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                    body: JSON.stringify({
                        invite_token: inviteToken,
                        name,
                        username,
                        email,
                        password,
                        password_confirmation: passwordConfirmation,
                        device_name: `LaraDisco Desktop (${process.platform})`,
                    }),
                });

                const body = await response.json();

                if (!response.ok) {
                    const errors = body.errors ?? {};
                    const firstError =
                        errors.invite_token?.[0] ||
                        errors.name?.[0] ||
                        errors.username?.[0] ||
                        errors.email?.[0] ||
                        errors.password?.[0] ||
                        body.message ||
                        'Registration failed';
                    return { success: false, error: firstError, errors };
                }

                const data = body.data;

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
                const message = err instanceof Error ? err.message : 'Registration failed';
                return { success: false, error: message };
            }
        },
    );

    ipcMain.handle('auth:getSession', async (_event, serverId: number) => {
        return getAuthSession(serverId);
    });

    ipcMain.handle('auth:logout', async (_event, host: string, serverId: number) => {
        const session = getAuthSession(serverId);
        if (session) {
            try {
                await net.fetch(`${buildBaseUrl(host)}/api/v1/auth/logout`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${session.token}`,
                        Accept: 'application/json',
                    },
                });
            } catch (error) {
                console.error(error);
            }
            removeAuthSession(serverId);
        }
        return { success: true };
    });

    ipcMain.handle('auth:validate', async (_event, host: string, token: string) => {
        try {
            const response = await net.fetch(`${buildBaseUrl(host)}/api/v1/auth/me`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                },
            });

            if (!response.ok) {
                return { valid: false };
            }

            const body = await response.json();
            return { valid: true, user: body.data ?? body };
        } catch {
            return { valid: false };
        }
    });

    ipcMain.handle('settings:get', async (_event, key: string) => {
        return getSetting(key);
    });

    ipcMain.handle('settings:set', async (_event, key: string, value: string) => {
        setSetting(key, value);
        return { success: true };
    });

    ipcMain.on('notifications:show', (_event, payload: { title: string; body: string; notificationId: string }) => {
        if (!Notification.isSupported()) return;

        const notification = new Notification({
            title: payload.title,
            body: payload.body,
        });

        notification.on('click', () => {
            const windows = BrowserWindow.getAllWindows();
            const win = windows[0];
            if (win) {
                if (win.isMinimized()) win.restore();
                win.focus();

                win.webContents.send('notifications:clicked', payload.notificationId);
            }
        });

        notification.show();
    });
}
