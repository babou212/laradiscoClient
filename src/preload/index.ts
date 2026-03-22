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
        validateInvite: (host: string, token: string) => ipcRenderer.invoke('auth:validateInvite', host, token),
        register: (
            host: string,
            serverId: number,
            inviteToken: string,
            name: string,
            username: string,
            email: string,
            password: string,
            passwordConfirmation: string,
        ) =>
            ipcRenderer.invoke(
                'auth:register',
                host,
                serverId,
                inviteToken,
                name,
                username,
                email,
                password,
                passwordConfirmation,
            ),
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

    messages: {
        storePlaintext: (serverId: number, messageId: number, plaintext: string) =>
            ipcRenderer.invoke('messages:storePlaintext', serverId, messageId, plaintext),
        getPlaintext: (serverId: number, messageId: number) =>
            ipcRenderer.invoke('messages:getPlaintext', serverId, messageId) as Promise<string | null>,
        getPlaintexts: (serverId: number, messageIds: number[]) =>
            ipcRenderer.invoke('messages:getPlaintexts', serverId, messageIds) as Promise<Record<number, string>>,
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

    mls: {
        isSetup: (serverId: number, userId?: number) =>
            ipcRenderer.invoke('mls:isSetup', serverId, userId) as Promise<boolean>,
        getDeviceId: (serverId: number, userId?: number) =>
            ipcRenderer.invoke('mls:getDeviceId', serverId, userId) as Promise<string | null>,
        setup: (serverId: number, deviceName: string, userId?: number) =>
            ipcRenderer.invoke('mls:setup', serverId, deviceName, userId),
        setupDevice: (serverId: number, deviceName: string, userId?: number) =>
            ipcRenderer.invoke('mls:setupDevice', serverId, deviceName, userId),
        encrypt: (params: { serverId: number; groupId: string; plaintext: string }) =>
            ipcRenderer.invoke('mls:encrypt', params),
        decrypt: (params: { serverId: number; groupId: string; messageBytes: string }) =>
            ipcRenderer.invoke('mls:decrypt', params),
        createGroup: (params: { serverId: number; groupId: string }) => ipcRenderer.invoke('mls:createGroup', params),
        joinGroup: (params: { serverId: number; welcomeBytes: string; ratchetTreeBytes: string }) =>
            ipcRenderer.invoke('mls:joinGroup', params),
        addMember: (params: { serverId: number; groupId: string; keyPackageBytes: string }) =>
            ipcRenderer.invoke('mls:addMember', params),
        removeMember: (params: { serverId: number; groupId: string; leafIndices: number[] }) =>
            ipcRenderer.invoke('mls:removeMember', params),
        processMessage: (params: { serverId: number; groupId: string; messageBytes: string }) =>
            ipcRenderer.invoke('mls:processMessage', params),
        selfUpdate: (params: { serverId: number; groupId: string }) => ipcRenderer.invoke('mls:selfUpdate', params),
        mergeCommit: (params: { serverId: number; groupId: string }) => ipcRenderer.invoke('mls:mergeCommit', params),
        clearPendingCommit: (params: { serverId: number; groupId: string }) =>
            ipcRenderer.invoke('mls:clearPendingCommit', params),
        generateKeyPackages: (serverId: number, count: number) =>
            ipcRenderer.invoke('mls:generateKeyPackages', serverId, count),
        getGroupInfo: (params: { serverId: number; groupId: string }) => ipcRenderer.invoke('mls:getGroupInfo', params),
        backupKeys: (serverId: number, pin: string) => ipcRenderer.invoke('mls:backupKeys', serverId, pin),
        restoreKeys: (serverId: number, backup: unknown, pin: string, userId?: number) =>
            ipcRenderer.invoke('mls:restoreKeys', serverId, backup, pin, userId),
        autoUpdateBackup: (serverId: number) => ipcRenderer.invoke('mls:autoUpdateBackup', serverId),
        hasBackupKey: (serverId: number) => ipcRenderer.invoke('mls:hasBackupKey', serverId) as Promise<boolean>,
        clearBackupKey: (serverId?: number) => ipcRenderer.invoke('mls:clearBackupKey', serverId),
        wipe: (serverId: number) => ipcRenderer.invoke('mls:wipe', serverId),
        wipeForUserMismatch: (serverId: number, userId: number) =>
            ipcRenderer.invoke('mls:wipeForUserMismatch', serverId, userId) as Promise<boolean>,
        generateSearchTokens: (params: { serverId: number; conversationId: string; plaintext: string }) =>
            ipcRenderer.invoke('mls:generateSearchTokens', params) as Promise<string[]>,
        generateSearchTrapdoor: (params: { serverId: number; conversationId: string; query: string }) =>
            ipcRenderer.invoke('mls:generateSearchTrapdoor', params) as Promise<string[]>,
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
