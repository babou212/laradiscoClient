import api from './client';
import type {
    JsonApiCollectionResponse,
    JsonApiResponse,
    MessageResource,
} from './types';

export interface SendMessageData {
    message_bytes: string;
    sender_device_id: string;
    reply_to_id?: string;
    attachment_ids?: string[];
    encrypted_attachments?: {
        id: string;
        key: string;
        iv: string;
        file_name: string;
        mime_type: string;
        size: number;
        thumbnail_key?: string;
        thumbnail_iv?: string;
    }[];
}

export interface EditMessageData {
    message_bytes: string;
    sender_device_id: string;
}

export async function getMessages(
    channelId: string,
    params?: { sort?: string; include?: string; cursor?: string },
): Promise<JsonApiCollectionResponse<MessageResource>> {
    const r = await api
        .get(`/channels/${channelId}/messages`, {
            params: {
                sort: 'created_at',
                include: 'user,reactions,replyTo,replyTo.user,threadStarted,encryptedAttachments',
                ...params,
            },
        });
    return r.data;
}

export async function sendMessage(
    channelId: string,
    data: SendMessageData,
): Promise<JsonApiResponse<MessageResource>> {
    const r = await api.post(`/channels/${channelId}/messages`, data);
    return r.data;
}

export async function editMessage(
    channelId: string,
    messageId: string,
    data: EditMessageData,
): Promise<JsonApiResponse<MessageResource>> {
    const r = await api
        .put(`/channels/${channelId}/messages/${messageId}`, data);
    return r.data;
}

export function deleteMessage(channelId: string, messageId: string): Promise<void> {
    return api.delete(`/channels/${channelId}/messages/${messageId}`);
}
