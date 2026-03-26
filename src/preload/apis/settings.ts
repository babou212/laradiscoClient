import { ipcRenderer } from 'electron';

export const settingsApi = {
    get: (key: string) => ipcRenderer.invoke('settings:get', key) as Promise<string | null>,
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
};
