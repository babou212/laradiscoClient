import api from './client';
import type { JsonApiCollectionResponse, UserResource } from './types';

export async function getMembers(params?: {
    'filter[search]'?: string;
    sort?: string;
}): Promise<JsonApiCollectionResponse<UserResource>> {
    const r = await api.get('/members', { params: { sort: 'username', include: 'roles', ...params } });
    return r.data;
}

export async function searchMentions(
    query: string,
    signal?: AbortSignal,
): Promise<JsonApiCollectionResponse<UserResource>> {
    const r = await api.get('/mentions/search', {
        params: { q: query, sort: 'username' },
        signal,
    });
    return r.data;
}
