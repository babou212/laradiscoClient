import { ipcRenderer } from 'electron';

export const updaterApi = {
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
        callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void,
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
};
