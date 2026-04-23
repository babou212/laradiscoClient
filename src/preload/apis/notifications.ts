import { ipcRenderer } from 'electron';

export const notificationsApi = {
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
};
