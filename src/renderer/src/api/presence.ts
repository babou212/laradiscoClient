import api from './client';
import type { OnlineUser } from '@/types';

export function updatePresence(data: { status: string; custom_status?: string | null }): Promise<void> {
    return api.patch('/presence', data);
}

export async function getPresence(): Promise<{ data: OnlineUser[] }> {
    const r = await api.get('/presence');
    return r.data;
}

export function sendHeartbeat(): Promise<void> {
    return api.post('/presence/heartbeat');
}
