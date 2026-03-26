import { ipcRenderer } from 'electron';

export const pttApi = {
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
};
