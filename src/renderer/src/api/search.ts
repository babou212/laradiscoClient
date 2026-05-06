import api from './client';
import type { AvatarUrls } from '@/types/chat';

export interface MessageSearchResult {
    id: string;
    content: string;
    user: { id: string; username: string; avatar_urls: AvatarUrls | null };
    channel_id?: string;
    direct_message_group_id?: string;
    thread_id?: string | null;
    created_at: string;
}

export interface MessageSearchResponse {
    data: MessageSearchResult[];
    meta: {
        current_page: number;
        last_page: number;
        total: number;
        query: string;
    };
}

interface JsonApiResource {
    id: string;
    type: string;
    attributes: Record<string, unknown>;
    relationships?: Record<string, { data?: { id: string; type: string } | null }>;
}

interface RawJsonApiResponse {
    data: JsonApiResource[];
    included?: JsonApiResource[];
    meta?: { current_page?: number; last_page?: number; total?: number; query?: string };
}

function normalize(raw: RawJsonApiResponse, kind: 'channel' | 'dm', query: string): MessageSearchResponse {
    const includedById = new Map<string, JsonApiResource>();
    for (const inc of raw.included ?? []) {
        includedById.set(`${inc.type}:${inc.id}`, inc);
    }

    const data: MessageSearchResult[] = raw.data.map((row) => {
        const attrs = row.attributes;
        const userRel = row.relationships?.user?.data;
        let user = { id: '', username: '', avatar_urls: null as AvatarUrls | null };
        if (userRel) {
            const inc = includedById.get(`${userRel.type}:${userRel.id}`);
            if (inc) {
                const a = inc.attributes;
                user = {
                    id: inc.id,
                    username: (a.username as string) ?? (a.name as string) ?? '',
                    avatar_urls: (a.avatar_urls as AvatarUrls | null) ?? null,
                };
            }
        }

        const result: MessageSearchResult = {
            id: row.id,
            content: (attrs.content as string) ?? '',
            user,
            created_at: (attrs.created_at as string) ?? '',
        };
        if (kind === 'channel') {
            result.channel_id = String(attrs.channel_id ?? '');
            result.thread_id = attrs.thread_id != null ? String(attrs.thread_id) : null;
        } else {
            result.direct_message_group_id = String(attrs.direct_message_group_id ?? '');
        }
        return result;
    });

    return {
        data,
        meta: {
            current_page: raw.meta?.current_page ?? 1,
            last_page: raw.meta?.last_page ?? 1,
            total: raw.meta?.total ?? data.length,
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
        params: { q, per_page: perPage, page, include: 'user' },
    });
    return normalize(r.data as RawJsonApiResponse, 'channel', q);
}

export async function searchDmMessages(
    dmGroupId: string | number,
    q: string,
    page = 1,
    perPage = 30,
): Promise<MessageSearchResponse> {
    const r = await api.get(`/direct-messages/${dmGroupId}/messages/search`, {
        params: { q, per_page: perPage, page, include: 'user' },
    });
    return normalize(r.data as RawJsonApiResponse, 'dm', q);
}
