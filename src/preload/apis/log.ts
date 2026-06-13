import { ipcRenderer } from 'electron';

export interface LogSaveResult {
    success: boolean;
    canceled?: boolean;
    error?: string;
}

export const logApi = {
    getPath: (): Promise<string> => ipcRenderer.invoke('log:getPath'),
    reveal: (): Promise<{ success: boolean }> => ipcRenderer.invoke('log:reveal'),
    save: (): Promise<LogSaveResult> => ipcRenderer.invoke('log:save'),
};
