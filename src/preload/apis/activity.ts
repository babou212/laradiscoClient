import { ipcRenderer } from 'electron';
import type { ClientActivity } from '../types/activity';

export const activityApi = {
    onChanged: (callback: (activity: ClientActivity | null) => void) => {
        ipcRenderer.on('activity:changed', (_event, activity: ClientActivity | null) => callback(activity));
    },
    removeChangedListeners: () => {
        ipcRenderer.removeAllListeners('activity:changed');
    },
    setEnabled: (enabled: boolean) =>
        ipcRenderer.invoke('activity:setEnabled', enabled) as Promise<{ success: boolean }>,
    getCurrent: () => ipcRenderer.invoke('activity:getCurrent') as Promise<ClientActivity | null>,
};
