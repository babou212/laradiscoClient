import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

// Custom APIs for renderer — bridge to main process IPC handlers
const api = {
    // Server connection
    server: {
        ping: (host: string) => ipcRenderer.invoke('server:ping', host),
        save: (name: string, host: string) => ipcRenderer.invoke('server:save', name, host),
        getActive: () => ipcRenderer.invoke('server:getActive'),
        getAll: () => ipcRenderer.invoke('server:getAll'),
        setActive: (id: number) => ipcRenderer.invoke('server:setActive', id),
        remove: (id: number) => ipcRenderer.invoke('server:remove', id),
    },
    // Authentication
    auth: {
        login: (host: string, serverId: number, email: string, password: string) =>
            ipcRenderer.invoke('auth:login', host, serverId, email, password),
        getSession: (serverId: number) => ipcRenderer.invoke('auth:getSession', serverId),
        logout: (host: string, serverId: number) =>
            ipcRenderer.invoke('auth:logout', host, serverId),
        validate: (host: string, token: string) =>
            ipcRenderer.invoke('auth:validate', host, token),
    },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
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
