import api from './client';
import type { MessageData } from '@/types/chat';

export type InboxMessageType = 'channel' | 'direct_message';

/** Payload is the same `message` object emitted by MessageSent/DirectMessageSent. */
export type InboxPayload = MessageData & {
    channel_id?: number | string;
    dm_group_id?: number | string;
};

export interface InboxItem {
    id: number;
    message_type: InboxMessageType;
    message_id: number;
    payload: InboxPayload;
    created_at: string | null;
}

export interface InboxAckItem {
    message_type: InboxMessageType;
    message_id: number;
}

/** Pending offline-delivery messages for the authenticated user (oldest first). */
export async function getInbox(): Promise<{ data: InboxItem[] }> {
    const r = await api.get('/inbox');
    return r.data;
}

/** Acknowledge delivered messages so the server deletes them from the inbox. Idempotent. */
export async function ackInbox(items: InboxAckItem[]): Promise<{ data: { deleted: number } }> {
    const r = await api.post('/inbox/ack', { items });
    return r.data;
}
