import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';


const api = {
    server: {
        ping: (host: string) => ipcRenderer.invoke('server:ping', host),
        save: (name: string, host: string) => ipcRenderer.invoke('server:save', name, host),
        getActive: () => ipcRenderer.invoke('server:getActive'),
        getAll: () => ipcRenderer.invoke('server:getAll'),
        setActive: (id: number) => ipcRenderer.invoke('server:setActive', id),
        remove: (id: number) => ipcRenderer.invoke('server:remove', id),
    },

    auth: {
        login: (host: string, serverId: number, email: string, password: string) =>
            ipcRenderer.invoke('auth:login', host, serverId, email, password),
        twoFactorChallenge: (
            host: string,
            serverId: number,
            challengeToken: string,
            code: string | null,
            recoveryCode: string | null,
        ) =>
            ipcRenderer.invoke(
                'auth:twoFactorChallenge',
                host,
                serverId,
                challengeToken,
                code,
                recoveryCode,
            ),
        getSession: (serverId: number) => ipcRenderer.invoke('auth:getSession', serverId),
        logout: (host: string, serverId: number) =>
            ipcRenderer.invoke('auth:logout', host, serverId),
        validate: (host: string, token: string) =>
            ipcRenderer.invoke('auth:validate', host, token),
    },

    ptt: {
        configure: (config: {
            keycode: number | null;
            ctrl: boolean;
            shift: boolean;
            alt: boolean;
            meta: boolean;
            enabled: boolean;
        }) => ipcRenderer.invoke('ptt:configure', config),
        captureNextKey: () =>
            ipcRenderer.invoke('ptt:captureNextKey') as Promise<{
                keycode: number;
                ctrlKey: boolean;
                shiftKey: boolean;
                altKey: boolean;
                metaKey: boolean;
            }>,
        cancelCapture: () => ipcRenderer.invoke('ptt:cancelCapture'),
        onActivated: (callback: () => void) => {
            ipcRenderer.on('ptt:activated', callback);
        },
        onDeactivated: (callback: () => void) => {
            ipcRenderer.on('ptt:deactivated', callback);
        },
        removeAllListeners: () => {
            ipcRenderer.removeAllListeners('ptt:activated');
            ipcRenderer.removeAllListeners('ptt:deactivated');
        },
    },

    notifications: {
        show: (payload: { title: string; body: string; notificationId: string }) =>
            ipcRenderer.send('notifications:show', payload),
        onClicked: (callback: (notificationId: string) => void) => {
            ipcRenderer.on('notifications:clicked', (_event, notificationId: string) => {
                callback(notificationId);
            });
        },
        removeAllListeners: () => {
            ipcRenderer.removeAllListeners('notifications:clicked');
        },
    },

    settings: {
        get: (key: string) => ipcRenderer.invoke('settings:get', key) as Promise<string | null>,
        set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    },

    window: {
        minimize: () => ipcRenderer.send('window:minimize'),
        maximize: () => ipcRenderer.send('window:maximize'),
        close: () => ipcRenderer.send('window:close'),
        isMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
        onMaximizedChange: (callback: (_event: unknown, isMaximized: boolean) => void) => {
            ipcRenderer.on('window:maximized-change', callback);
        },
        removeMaximizedListener: () => {
            ipcRenderer.removeAllListeners('window:maximized-change');
        },
        onBeforeQuit: (callback: () => void) => {
            ipcRenderer.on('app:before-quit', callback);
        },
        removeBeforeQuitListener: () => {
            ipcRenderer.removeAllListeners('app:before-quit');
        },
        platform: process.platform,
    },
};

if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld('electron', electronAPI);
        contextBridge.exposeInMainWorld('api', api);
    } catch (error) {
        console.error(error);
    }
} else {
    // @ts-expect-error (define in dts)
    window.electron = electronAPI;
    // @ts-expect-error (define in dts)
    window.api = api;
}
