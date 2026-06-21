import type { LinkPreviewData } from '@/types/chat';
import api from './client';
import type { JsonApiCollectionResponse, JsonApiResponse, MessageResource } from './types';

export interface SendMessageData {
    content: string;
    reply_to_id?: string;
    attachment_ids?: string[];
    client_temp_id?: string;
    mention_user_ids?: number[];
    mention_everyone?: boolean;
    mention_here?: boolean;
    thread_name?: string;
    link_preview?: LinkPreviewData | null;
}

export interface EditMessageData {
    content: string;
}

export async function getMessages(
    channelId: string,
    params?: { include?: string; limit?: number; before?: string; after?: string; around?: string },
): Promise<JsonApiCollectionResponse<MessageResource>> {
    const r = await api.get(`/channels/${channelId}/messages`, {
        params: {
            include:
                'user,reactions,replyTo,replyTo.user,threadStarted,threadStarted.latestReply,threadStarted.latestReply.user,attachments',
            ...params,
        },
    });
    return r.data;
}

export async function sendMessage(channelId: string, data: SendMessageData): Promise<JsonApiResponse<MessageResource>> {
    const r = await api.post(`/channels/${channelId}/messages`, data);
    return r.data;
}

export async function editMessage(
    channelId: string,
    messageId: string,
    data: EditMessageData,
): Promise<JsonApiResponse<MessageResource>> {
    const r = await api.put(`/channels/${channelId}/messages/${messageId}`, data);
    return r.data;
}

export function deleteMessage(channelId: string, messageId: string): Promise<void> {
    return api.delete(`/channels/${channelId}/messages/${messageId}`);
}
