import api from './client';
import type { JsonApiResponse, UserResource } from './types';

export function getUserProfile(id: string): Promise<JsonApiResponse<UserResource>> {
    return api.get(`/users/${id}`).then((r) => r.data);
}
