import { ipcRenderer } from 'electron';

export const trayApi = {
    updateUnreadCount: (count: number) => ipcRenderer.send('tray:update-unread-count', count),
    updateMuteState: (muted: boolean) => ipcRenderer.send('tray:update-mute-state', muted),
    onMuteToggled: (callback: (muted: boolean) => void) => {
        ipcRenderer.on('tray:mute-toggled', (_event, muted: boolean) => {
            callback(muted);
        });
    },
    removeAllListeners: () => {
        ipcRenderer.removeAllListeners('tray:mute-toggled');
    },
};
