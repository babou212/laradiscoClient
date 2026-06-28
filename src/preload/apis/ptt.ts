import { ipcRenderer } from 'electron';
import type { PttBinding, PttCapture, PttLinuxInputStatus, PttLinuxSetupResult } from '../types/ptt';

export const pttApi = {
    configure: (config: { enabled: boolean; binding: PttBinding | null }) =>
        ipcRenderer.invoke('ptt:configure', config),
    captureNextKey: () => ipcRenderer.invoke('ptt:captureNextKey') as Promise<PttCapture>,
    cancelCapture: () => ipcRenderer.invoke('ptt:cancelCapture'),
    linuxInputStatus: () => ipcRenderer.invoke('ptt:linuxInputStatus') as Promise<PttLinuxInputStatus>,
    setupLinuxInputAccess: () => ipcRenderer.invoke('ptt:setupLinuxInputAccess') as Promise<PttLinuxSetupResult>,
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
