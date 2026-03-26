export interface SearchResult {
    messageId: number;
    serverId: number;
    snippet: string;
    conversationType: string;
    conversationId: number;
    userName: string;
}

export interface MessagesApi {
    storeDecrypted: (serverId: number, messageId: number, plaintext: string) => Promise<void>;
    getDecryptedBatch: (serverId: number, messageIds: number[]) => Promise<Record<number, string>>;
    indexForSearch: (params: {
        serverId: number;
        messageId: number;
        conversationType: 'channel' | 'dm';
        conversationId: number;
        userName: string;
        plaintext: string;
    }) => Promise<void>;
    removeFromSearchIndex: (serverId: number, messageId: number) => Promise<void>;
    searchLocal: (params: {
        serverId: number;
        conversationType: 'channel' | 'dm';
        conversationId: number;
        query: string;
        limit?: number;
        offset?: number;
    }) => Promise<SearchResult[]>;
    clearSearchIndex: (serverId: number) => Promise<void>;
}
