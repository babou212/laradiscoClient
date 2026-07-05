import { ipcRenderer } from 'electron';
import type { OutboxRow } from '../types/outbox';

export const outboxApi = {
    enqueue: (row: OutboxRow) => ipcRenderer.invoke('outbox:enqueue', row) as Promise<{ success: boolean }>,
    remove: (clientTempId: string) =>
        ipcRenderer.invoke('outbox:remove', clientTempId) as Promise<{ success: boolean }>,
    listForChannel: (channelId: string, isDm: boolean) =>
        ipcRenderer.invoke('outbox:list-for-channel', channelId, isDm) as Promise<OutboxRow[]>,
    get: (clientTempId: string) => ipcRenderer.invoke('outbox:get', clientTempId) as Promise<OutboxRow | null>,
};
