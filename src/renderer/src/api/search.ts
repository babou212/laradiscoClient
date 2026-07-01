import type { MessageData } from '@/types/chat';
import { normalizeMessages } from './normalizers';
import type { DirectMessageResource, JsonApiResource, MessageResource } from './types';
import api from './client';

export interface MessageSearchResponse {
    data: MessageData[];
    meta: {
        current_page: number;
        last_page: number;
        total: number;
        query: string;
    };
}

const SEARCH_INCLUDE = 'user,reactions,replyTo,replyTo.user,attachments';

interface RawSearchResponse {
    data: (MessageResource | DirectMessageResource)[];
    included?: JsonApiResource[];
    meta?: { current_page?: number; last_page?: number; total?: number; query?: string };
}

function normalize(raw: RawSearchResponse, query: string): MessageSearchResponse {
    return {
        data: normalizeMessages(raw.data, raw.included),
        meta: {
            current_page: raw.meta?.current_page ?? 1,
            last_page: raw.meta?.last_page ?? 1,
            total: raw.meta?.total ?? raw.data.length,
            query: raw.meta?.query ?? query,
        },
    };
}

export async function searchChannelMessages(
    channelId: string | number,
    q: string,
    page = 1,
    perPage = 30,
): Promise<MessageSearchResponse> {
    const r = await api.get(`/channels/${channelId}/messages/search`, {
        params: { q, per_page: perPage, page, include: SEARCH_INCLUDE },
    });
    return normalize(r.data as RawSearchResponse, q);
}

export async function searchDmMessages(
    dmGroupId: string | number,
    q: string,
    page = 1,
    perPage = 30,
): Promise<MessageSearchResponse> {
    const r = await api.get(`/direct-messages/${dmGroupId}/messages/search`, {
        params: { q, per_page: perPage, page, include: SEARCH_INCLUDE },
    });
    return normalize(r.data as RawSearchResponse, q);
}
