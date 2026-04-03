import api from './client';
import type { JsonApiResponse, ReactionResource } from './types';

export interface ToggleReactionData {
    emoji: string;
}

export interface ToggleReactionResponse {
    data?: ReactionResource;
    meta: { added: boolean };
}

export async function toggleChannelReaction(
    channelId: string,
    messageId: string,
    data: ToggleReactionData,
): Promise<ToggleReactionResponse> {
    const r = await api
        .post(`/channels/${channelId}/messages/${messageId}/reactions`, data);
    return r.data;
}

export async function toggleDmReaction(
    groupId: string,
    messageId: string,
    data: ToggleReactionData,
): Promise<ToggleReactionResponse> {
    const r = await api
        .post(`/direct-messages/${groupId}/messages/${messageId}/reactions`, data);
    return r.data;
}
