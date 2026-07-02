import { ipcRenderer } from 'electron';

export const idleApi = {
    /** Seconds since the last system-wide user input (keyboard/mouse). */
    getSystemIdleTime: () => ipcRenderer.invoke('idle:getSystemIdleTime') as Promise<number>,
};
