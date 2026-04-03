import api from './client';
import type {
    DirectMessageGroupResource,
    DirectMessageResource,
    JsonApiCollectionResponse,
    JsonApiResponse,
} from './types';

export interface SendDmMessageData {
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

export interface EditDmMessageData {
    message_bytes: string;
    sender_device_id: string;
}

export async function getDmGroups(params?: {
    sort?: string;
    include?: string;
}): Promise<JsonApiCollectionResponse<DirectMessageGroupResource>> {
    const r = await api
        .get('/direct-messages', {
            params: {
                sort: '-last_message_at',
                include: 'participants,lastMessage,lastMessage.user',
                ...params,
            },
        });
    return r.data;
}

export async function getDmMessages(
    groupId: string,
    params?: { sort?: string; include?: string; cursor?: string },
): Promise<
    JsonApiCollectionResponse<DirectMessageResource> & {
        meta?: { dm_group?: JsonApiResponse<DirectMessageGroupResource> } & Record<
            string,
            unknown
        >;
    }
> {
    const r = await api
        .get(`/direct-messages/${groupId}`, {
            params: {
                sort: 'created_at',
                include: 'user,reactions,replyTo,replyTo.user,encryptedAttachments',
                ...params,
            },
        });
    return r.data;
}

export async function sendDmMessage(
    groupId: string,
    data: SendDmMessageData,
): Promise<JsonApiResponse<DirectMessageResource>> {
    const r = await api.post(`/direct-messages/${groupId}/messages`, data);
    return r.data;
}

export async function editDmMessage(
    groupId: string,
    messageId: string,
    data: EditDmMessageData,
): Promise<JsonApiResponse<DirectMessageResource>> {
    const r = await api
        .put(`/direct-messages/${groupId}/messages/${messageId}`, data);
    return r.data;
}

export function deleteDmMessage(groupId: string, messageId: string): Promise<void> {
    return api.delete(`/direct-messages/${groupId}/messages/${messageId}`);
}

export async function findDmGroup(
    userId: string,
): Promise<{ data: { dm_group_id: number } }> {
    const r = await api
        .get('/direct-messages/find', { params: { user_id: userId } });
    return r.data;
}

export async function createDmGroup(
    userId: string,
): Promise<JsonApiResponse<DirectMessageGroupResource> | { data: { dm_group_id: number } }> {
    const r = await api.post('/direct-messages', { user_id: userId });
    return r.data;
}
