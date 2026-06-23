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
        const listener = (): void => callback();
        ipcRenderer.on('ptt:activated', listener);
        return () => ipcRenderer.removeListener('ptt:activated', listener);
    },
    onDeactivated: (callback: () => void) => {
        const listener = (): void => callback();
        ipcRenderer.on('ptt:deactivated', listener);
        return () => ipcRenderer.removeListener('ptt:deactivated', listener);
    },
    removeAllListeners: () => {
        ipcRenderer.removeAllListeners('ptt:activated');
        ipcRenderer.removeAllListeners('ptt:deactivated');
    },
};
