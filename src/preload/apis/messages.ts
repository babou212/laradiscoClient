import { ipcRenderer } from 'electron';

export const messagesApi = {
    storeDecrypted: (serverId: number, messageId: number, plaintext: string) =>
        ipcRenderer.invoke('messages:storeDecrypted', serverId, messageId, plaintext),
    storeDecryptedIfAbsent: (serverId: number, messageId: number, plaintext: string) =>
        ipcRenderer.invoke('messages:storeDecryptedIfAbsent', serverId, messageId, plaintext),
    getDecryptedBatch: (serverId: number, messageIds: number[]) =>
        ipcRenderer.invoke('messages:getDecryptedBatch', serverId, messageIds) as Promise<Record<number, string>>,
    indexForSearch: (params: {
        serverId: number;
        messageId: number;
        conversationType: 'channel' | 'dm';
        conversationId: number;
        userName: string;
        plaintext: string;
    }) => ipcRenderer.invoke('messages:indexForSearch', params),
    removeFromSearchIndex: (serverId: number, messageId: number) =>
        ipcRenderer.invoke('messages:removeFromSearchIndex', serverId, messageId),
    searchLocal: (params: {
        serverId: number;
        conversationType: 'channel' | 'dm';
        conversationId: number;
        query: string;
        limit?: number;
        offset?: number;
    }) =>
        ipcRenderer.invoke('messages:searchLocal', params) as Promise<
            Array<{
                messageId: number;
                serverId: number;
                snippet: string;
                conversationType: string;
                conversationId: number;
                userName: string;
            }>
        >,
    clearSearchIndex: (serverId: number) => ipcRenderer.invoke('messages:clearSearchIndex', serverId),
};
