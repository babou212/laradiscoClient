import { electronAPI } from '@electron-toolkit/preload';
import { contextBridge, ipcRenderer } from 'electron';

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
        ) => ipcRenderer.invoke('auth:twoFactorChallenge', host, serverId, challengeToken, code, recoveryCode),
        getSession: (serverId: number) => ipcRenderer.invoke('auth:getSession', serverId),
        logout: (host: string, serverId: number) => ipcRenderer.invoke('auth:logout', host, serverId),
        validate: (host: string, token: string) => ipcRenderer.invoke('auth:validate', host, token),
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

    updater: {
        check: () => ipcRenderer.invoke('updater:check'),
        download: () => ipcRenderer.invoke('updater:download'),
        install: () => ipcRenderer.invoke('updater:install'),
        onUpdateAvailable: (callback: (info: { version: string; releaseNotes: string }) => void) => {
            ipcRenderer.on('updater:update-available', (_event, info) => callback(info));
        },
        onUpToDate: (callback: () => void) => {
            ipcRenderer.on('updater:up-to-date', callback);
        },
        onDownloadProgress: (
            callback: (progress: {
                percent: number;
                bytesPerSecond: number;
                transferred: number;
                total: number;
            }) => void,
        ) => {
            ipcRenderer.on('updater:download-progress', (_event, progress) => callback(progress));
        },
        onUpdateDownloaded: (callback: () => void) => {
            ipcRenderer.on('updater:update-downloaded', callback);
        },
        onError: (callback: (error: string) => void) => {
            ipcRenderer.on('updater:error', (_event, error) => callback(error));
        },
        removeAllListeners: () => {
            ipcRenderer.removeAllListeners('updater:update-available');
            ipcRenderer.removeAllListeners('updater:up-to-date');
            ipcRenderer.removeAllListeners('updater:download-progress');
            ipcRenderer.removeAllListeners('updater:update-downloaded');
            ipcRenderer.removeAllListeners('updater:error');
        },
    },

    e2ee: {
        isSetup: (serverId: number, userId?: number) =>
            ipcRenderer.invoke('e2ee:isSetup', serverId, userId) as Promise<boolean>,
        getDeviceId: (serverId: number, userId?: number) =>
            ipcRenderer.invoke('e2ee:getDeviceId', serverId, userId) as Promise<string | null>,
        setup: (serverId: number, deviceName: string, userId?: number) =>
            ipcRenderer.invoke('e2ee:setup', serverId, deviceName, userId),
        setupDevice: (serverId: number, deviceName: string, userId?: number) =>
            ipcRenderer.invoke('e2ee:setupDevice', serverId, deviceName, userId),
        getPublicKeys: (serverId: number) => ipcRenderer.invoke('e2ee:getPublicKeys', serverId),
        encrypt: (params: { serverId: number; type: 'channel' | 'dm'; targetId: number; plaintext: string }) =>
            ipcRenderer.invoke('e2ee:encrypt', params) as Promise<string>,
        decrypt: (params: {
            serverId: number;
            payload: string;
            senderId: number;
            senderDeviceId: string;
            channelId?: number;
            dmGroupId?: number;
        }) => ipcRenderer.invoke('e2ee:decrypt', params) as Promise<string>,
        createSenderKey: (serverId: number, channelId: number) =>
            ipcRenderer.invoke('e2ee:createSenderKey', serverId, channelId),
        processSenderKeyDist: (params: {
            serverId: number;
            channelId: number;
            senderId: string;
            senderDeviceId: string;
            distribution: unknown;
        }) => ipcRenderer.invoke('e2ee:processSenderKeyDist', params),
        backupKeys: (serverId: number, pin: string) => ipcRenderer.invoke('e2ee:backupKeys', serverId, pin),
        restoreKeys: (serverId: number, backup: unknown, pin: string) =>
            ipcRenderer.invoke('e2ee:restoreKeys', serverId, backup, pin),
        autoUpdateBackup: (serverId: number) => ipcRenderer.invoke('e2ee:autoUpdateBackup', serverId),
        hasBackupKey: (serverId: number) => ipcRenderer.invoke('e2ee:hasBackupKey', serverId) as Promise<boolean>,
        clearBackupKey: (serverId?: number) => ipcRenderer.invoke('e2ee:clearBackupKey', serverId),
        rotateSignedPreKey: (serverId: number) => ipcRenderer.invoke('e2ee:rotateSignedPreKey', serverId),
        generatePreKeys: (serverId: number, count: number) =>
            ipcRenderer.invoke('e2ee:generatePreKeys', serverId, count),
        wipe: (serverId: number) => ipcRenderer.invoke('e2ee:wipe', serverId),
        wipeForUserMismatch: (serverId: number, userId: number) =>
            ipcRenderer.invoke('e2ee:wipeForUserMismatch', serverId, userId) as Promise<boolean>,
        invalidateChannelSenderKeys: (serverId: number, channelId: number) =>
            ipcRenderer.invoke('e2ee:invalidateChannelSenderKeys', serverId, channelId),
        encryptSenderKeyDist: (params: {
            distribution: { distributionId: string; chainKey: string; signingPublicKey: string; chainIndex: number };
            recipientDeviceIdentityKey: string;
        }) =>
            ipcRenderer.invoke('e2ee:encryptSenderKeyDist', params) as Promise<{
                encryptedDistribution: string;
                ephemeralPublicKey: string;
                nonce: string;
            }>,
        decryptSenderKeyDist: (params: {
            serverId: number;
            encryptedDistribution: string;
            ephemeralPublicKey: string;
            nonce: string;
        }) =>
            ipcRenderer.invoke('e2ee:decryptSenderKeyDist', params) as Promise<{
                distributionId: string;
                chainKey: string;
                signingPublicKey: string;
                chainIndex: number;
            }>,
        generateSearchTokens: (params: {
            serverId: number;
            type: 'channel' | 'dm';
            targetId: number;
            plaintext: string;
        }) => ipcRenderer.invoke('e2ee:generateSearchTokens', params) as Promise<string[]>,
        generateSearchTrapdoor: (params: {
            serverId: number;
            type: 'channel' | 'dm';
            targetId: number;
            query: string;
        }) => ipcRenderer.invoke('e2ee:generateSearchTrapdoor', params) as Promise<string[]>,
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
