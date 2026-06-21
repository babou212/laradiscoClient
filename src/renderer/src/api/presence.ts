import type { OnlineUser } from '@/types';
import api from './client';

/** Activity as sent to the server — `started_at` is stamped server-side. */
export interface ActivityInput {
    type: 'game' | 'music' | 'app';
    name: string;
    application_id: string;
    details?: string | null;
    icon?: string | null;
}

export function updatePresence(data: { status: string; custom_status?: string | null }): Promise<void> {
    return api.patch('/presence', data);
}

export function updateActivity(activity: ActivityInput | null): Promise<void> {
    return api.patch('/presence/activity', { activity });
}

export async function getPresence(): Promise<{ data: OnlineUser[] }> {
    const r = await api.get('/presence');
    return r.data;
}

export function sendHeartbeat(): Promise<void> {
    return api.post('/presence/heartbeat');
}
