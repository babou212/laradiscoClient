import api from './client';
import type { JsonApiCollectionResponse, NotificationResource } from './types';

export async function getNotifications(params?: { sort?: string; cursor?: string }): Promise<
    JsonApiCollectionResponse<NotificationResource> & {
        meta?: { unread_count?: number } & Record<string, unknown>;
    }
> {
    const r = await api.get('/notifications', {
        params: { sort: '-created_at', ...params },
    });
    return r.data;
}

export async function markNotificationRead(id: string): Promise<{ meta: { unread_count: number } }> {
    const r = await api.patch(`/notifications/${id}`);
    return r.data;
}

export async function markAllNotificationsRead(): Promise<{ meta: { unread_count: number } }> {
    const r = await api.patch('/notifications');
    return r.data;
}
