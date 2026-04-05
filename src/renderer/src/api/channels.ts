import api from './client';
import type { ChannelResource, JsonApiResponse } from './types';

export interface CreateChannelData {
    name: string;
    channel_type?: string;
    topic?: string;
    is_private?: boolean;
}

export interface UpdateChannelData {
    name?: string;
    topic?: string;
    is_private?: boolean;
    position?: number;
}

export async function getChannel(id: string): Promise<JsonApiResponse<ChannelResource>> {
    const r = await api.get(`/channels/${id}`);
    return r.data;
}

export async function createChannel(
    categoryId: string,
    data: CreateChannelData,
): Promise<JsonApiResponse<ChannelResource>> {
    const r = await api.post(`/settings/categories/${categoryId}/channels`, data);
    return r.data;
}

export async function updateChannel(id: string, data: UpdateChannelData): Promise<JsonApiResponse<ChannelResource>> {
    const r = await api.put(`/settings/channels/${id}`, data);
    return r.data;
}
