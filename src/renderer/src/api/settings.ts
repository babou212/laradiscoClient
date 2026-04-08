import api from './client';
import type {
    CategoryResource,
    ChannelResource,
    InviteLinkResource,
    JsonApiCollectionResponse,
    JsonApiResponse,
    RoleResource,
    UserResource,
} from './types';

export async function getProfile(): Promise<JsonApiResponse<UserResource>> {
    const r = await api.get('/settings/profile');
    return r.data;
}

export async function updateProfile(data: { name?: string; email?: string }): Promise<JsonApiResponse<UserResource>> {
    const r = await api.patch('/settings/profile', data);
    return r.data;
}

export function updatePassword(data: {
    current_password: string;
    password: string;
    password_confirmation: string;
}): Promise<void> {
    return api.put('/settings/password', data);
}

export async function uploadAvatar(blob: Blob): Promise<JsonApiResponse<UserResource>> {
    const formData = new FormData();
    formData.append('avatar', blob, 'avatar.png');
    const r = await api.post('/settings/profile/avatar', formData, {
        headers: { 'Content-Type': undefined },
    });
    return r.data;
}

export function deleteAvatar(): Promise<void> {
    return api.delete('/settings/profile/avatar');
}

export async function getInviteLinks(params?: {
    sort?: string;
    include?: string;
    cursor?: string;
}): Promise<JsonApiCollectionResponse<InviteLinkResource>> {
    const r = await api.get('/settings/invite-links', {
        params: { sort: '-created_at', include: 'creator,usedByUser', ...params },
    });
    return r.data;
}

export async function createInviteLink(): Promise<JsonApiResponse<InviteLinkResource>> {
    const r = await api.post('/settings/invite-links');
    return r.data;
}

export function deleteInviteLink(id: string): Promise<void> {
    return api.delete(`/settings/invite-links/${id}`);
}

export async function getRoles(params?: { sort?: string }): Promise<
    JsonApiCollectionResponse<RoleResource> & {
        meta?: { permissions?: string[] } & Record<string, unknown>;
    }
> {
    const r = await api.get('/settings/roles', { params: { sort: '-position', ...params } });
    return r.data;
}

export async function createRole(data: {
    name: string;
    color?: string;
    permissions?: string[];
}): Promise<JsonApiResponse<RoleResource>> {
    const r = await api.post('/settings/roles', data);
    return r.data;
}

export async function updateRole(
    id: string,
    data: { name?: string; color?: string; permissions?: string[] },
): Promise<JsonApiResponse<RoleResource>> {
    const r = await api.put(`/settings/roles/${id}`, data);
    return r.data;
}

export async function getSettingsMembers(params?: {
    sort?: string;
    'filter[username]'?: string;
    'filter[name]'?: string;
    include?: string;
    page?: number;
}): Promise<
    JsonApiCollectionResponse<UserResource> & {
        meta?: { roles?: unknown[] } & Record<string, unknown>;
    }
> {
    const r = await api.get('/settings/members', {
        params: { sort: 'username', include: 'roles', ...params },
    });
    return r.data;
}

export function updateMemberRole(memberId: string, roleId: string): Promise<void> {
    return api.post(`/settings/members/${memberId}/roles`, { role_id: roleId });
}

export function removeMemberRole(memberId: string, roleId: string): Promise<void> {
    return api.delete(`/settings/members/${memberId}/roles/${roleId}`);
}

export function deleteAccount(password: string): Promise<void> {
    return api.delete('/settings/profile', { data: { password } });
}

export async function getSettingsChannels(params?: { sort?: string; include?: string }): Promise<
    JsonApiCollectionResponse<CategoryResource> & {
        meta?: { roles?: unknown[]; permissions?: string[] } & Record<string, unknown>;
        included?: (ChannelResource | unknown)[];
    }
> {
    const r = await api.get('/settings/channels', {
        params: { sort: 'position', include: 'channels', ...params },
    });
    return r.data;
}

export async function createSettingsChannel(data: {
    name: string;
    category_id: string | null;
    channel_type?: string;
    topic?: string;
    is_private?: boolean;
}): Promise<JsonApiResponse<ChannelResource>> {
    const r = await api.post('/settings/channels', data);
    return r.data;
}

export async function updateSettingsChannel(
    id: string,
    data: {
        name?: string;
        topic?: string;
        is_private?: boolean;
        position?: number;
    },
): Promise<JsonApiResponse<ChannelResource>> {
    const r = await api.put(`/settings/channels/${id}`, data);
    return r.data;
}

export async function createSettingsCategory(data: {
    name: string;
    position?: number;
}): Promise<JsonApiResponse<CategoryResource>> {
    const r = await api.post('/settings/categories', data);
    return r.data;
}

export async function updateSettingsCategory(
    id: string,
    data: { name?: string; position?: number },
): Promise<JsonApiResponse<CategoryResource>> {
    const r = await api.put(`/settings/categories/${id}`, data);
    return r.data;
}

export function deleteRole(id: string): Promise<void> {
    return api.delete(`/settings/roles/${id}`);
}

export function deleteSettingsChannel(id: string): Promise<void> {
    return api.delete(`/settings/channels/${id}`);
}

export function deleteSettingsCategory(id: string): Promise<void> {
    return api.delete(`/settings/categories/${id}`);
}

export async function getChannelOverrides(channelId: string): Promise<unknown[]> {
    const r = await api.get(`/settings/channels/${channelId}/overrides`);
    return r.data;
}

export async function createChannelOverride(
    channelId: string,
    data: { role_id: string | null; allow: string[]; deny: string[] },
): Promise<unknown> {
    const r = await api.post(`/settings/channels/${channelId}/overrides`, data);
    return r.data;
}

export function deleteChannelOverride(channelId: string, overrideId: string): Promise<void> {
    return api.delete(`/settings/channels/${channelId}/overrides/${overrideId}`);
}
