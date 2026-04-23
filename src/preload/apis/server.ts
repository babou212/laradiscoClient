import { ipcRenderer } from 'electron';

export const serverApi = {
    ping: (host: string) => ipcRenderer.invoke('server:ping', host),
    save: (name: string, host: string) => ipcRenderer.invoke('server:save', name, host),
    getActive: () => ipcRenderer.invoke('server:getActive'),
    getAll: () => ipcRenderer.invoke('server:getAll'),
    setActive: (id: number) => ipcRenderer.invoke('server:setActive', id),
    remove: (id: number) => ipcRenderer.invoke('server:remove', id),
};
