import api from './client';
import type { DirectMessageResource, JsonApiCollectionResponse, JsonApiResponse, MessageResource } from './types';

export async function getChannelPins(
    channelId: string,
    params?: { sort?: string; include?: string },
): Promise<JsonApiCollectionResponse<MessageResource>> {
    const r = await api.get(`/channels/${channelId}/pins`, {
        params: { sort: '-created_at', include: 'user,reactions', ...params },
    });
    return r.data;
}

export async function pinChannelMessage(
    channelId: string,
    messageId: string,
): Promise<JsonApiResponse<MessageResource>> {
    const r = await api.post(`/channels/${channelId}/messages/${messageId}/pin`);
    return r.data;
}

export async function getDmPins(
    groupId: string,
    params?: { sort?: string; include?: string },
): Promise<JsonApiCollectionResponse<DirectMessageResource>> {
    const r = await api.get(`/direct-messages/${groupId}/pins`, {
        params: { sort: '-created_at', include: 'user,reactions', ...params },
    });
    return r.data;
}

export async function pinDmMessage(
    groupId: string,
    messageId: string,
): Promise<JsonApiResponse<DirectMessageResource>> {
    const r = await api.post(`/direct-messages/${groupId}/messages/${messageId}/pin`);
    return r.data;
}

export function unpinChannelMessage(channelId: string | number, messageId: string | number): Promise<void> {
    return api.delete(`/channels/${channelId}/messages/${messageId}/pin`);
}

export function unpinDmMessage(groupId: string | number, messageId: string | number): Promise<void> {
    return api.delete(`/direct-messages/${groupId}/messages/${messageId}/pin`);
}
