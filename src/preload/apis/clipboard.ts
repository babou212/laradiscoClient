import { ipcRenderer } from 'electron';

export const clipboardApi = {
    readText: () => ipcRenderer.invoke('clipboard:readText') as Promise<string>,
    writeText: (text: string) => ipcRenderer.send('clipboard:writeText', text),
};
