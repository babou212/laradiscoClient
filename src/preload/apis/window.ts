import { ipcRenderer } from 'electron';

export const windowApi = {
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
};
