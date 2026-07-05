export interface OutboxRow {
    client_temp_id: string;
    channel_id: string;
    is_dm: boolean;
    is_thread: boolean;
    thread_message_id: string | null;
    /** JSON string of the exact API request body, re-POSTed verbatim on retry. */
    payload: string;
    /** JSON string of the full optimistic MessageData, for offline re-render. */
    optimistic: string;
    error: string | null;
    created_at: string;
}

export interface OutboxApi {
    enqueue: (row: OutboxRow) => Promise<{ success: boolean }>;
    remove: (clientTempId: string) => Promise<{ success: boolean }>;
    listForChannel: (channelId: string, isDm: boolean) => Promise<OutboxRow[]>;
    get: (clientTempId: string) => Promise<OutboxRow | null>;
}
