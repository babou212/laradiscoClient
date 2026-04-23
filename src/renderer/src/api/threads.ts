import api from './client';
import type { JsonApiCollectionResponse, JsonApiResponse, MessageResource, ThreadResource } from './types';

export interface CreateThreadReplyData {
    message_bytes: string;
    sender_device_id: string;
}

export interface EditThreadMessageData {
    message_bytes: string;
    sender_device_id: string;
}

export async function getThread(
    channelId: string,
    threadId: string,
): Promise<
    JsonApiResponse<ThreadResource> & {
        meta?: { parent_message?: JsonApiResponse<MessageResource> } & Record<string, unknown>;
    }
> {
    const r = await api.get(`/channels/${channelId}/threads/${threadId}`);
    return r.data;
}

export async function getThreadMessages(
    channelId: string,
    threadId: string,
    params?: { sort?: string; include?: string; cursor?: string },
): Promise<JsonApiCollectionResponse<MessageResource>> {
    const r = await api.get(`/channels/${channelId}/threads/${threadId}/messages`, {
        params: {
            sort: 'created_at',
            include: 'user,reactions,encryptedAttachments',
            ...params,
        },
    });
    return r.data;
}

export async function createThreadReply(
    channelId: string,
    messageId: string,
    data: CreateThreadReplyData,
): Promise<JsonApiResponse<MessageResource>> {
    const r = await api.post(`/channels/${channelId}/messages/${messageId}/thread`, data);
    return r.data;
}

export async function editThreadMessage(
    channelId: string,
    threadId: string,
    messageId: string,
    data: EditThreadMessageData,
): Promise<JsonApiResponse<MessageResource>> {
    const r = await api.put(`/channels/${channelId}/threads/${threadId}/messages/${messageId}`, data);
    return r.data;
}

export function deleteThreadMessage(channelId: string, threadId: string, messageId: string): Promise<void> {
    return api.delete(`/channels/${channelId}/threads/${threadId}/messages/${messageId}`);
}

export async function toggleThreadReaction(
    channelId: string | number,
    threadId: string | number,
    messageId: string | number,
    data: { emoji: string },
): Promise<{ data?: unknown; meta?: { added: boolean } }> {
    const r = await api.post(`/channels/${channelId}/threads/${threadId}/messages/${messageId}/reactions`, data);
    return r.data;
}

export function followThread(channelId: string | number, threadId: string | number): Promise<void> {
    return api.post(`/channels/${channelId}/threads/${threadId}/follow`);
}

export function unfollowThread(channelId: string | number, threadId: string | number): Promise<void> {
    return api.delete(`/channels/${channelId}/threads/${threadId}/follow`);
}
