import api from './client';

export async function getVoiceParticipants(): Promise<{
    participants: Record<
        string,
        Array<{
            id: number;
            username: string;
            display_name: string;
            avatar_urls: { thumb: string; small: string; medium: string; original: string } | null;
        }>
    >;
    started_at: Record<string, number | null>;
}> {
    const r = await api.get('/voice/participants');
    return r.data?.data ?? { participants: {}, started_at: {} };
}

export async function joinVoiceChannel(
    channelId: number,
): Promise<{ token: string; url: string; e2ee_key: string; e2ee_key_index: number; started_at: number | null }> {
    const r = await api.post(`/channels/${channelId}/voice/join`);
    return r.data?.data ?? r.data;
}

// Current shared E2EE key + index for a channel, used to resync after a
// reconnect in case a rotation was missed while the socket was down.
export async function getVoiceChannelKey(channelId: number): Promise<{ e2ee_key: string; e2ee_key_index: number }> {
    const r = await api.get(`/channels/${channelId}/voice/key`);
    return r.data?.data ?? r.data;
}

export function leaveVoiceMembership(channelId: number): Promise<void> {
    return api.delete(`/channels/${channelId}/voice/membership`);
}

export function moveVoiceMember(fromChannelId: number, toChannelId: number, userId: string | number): Promise<void> {
    return api.post(`/channels/${fromChannelId}/voice/move`, { to_channel_id: toChannelId, user_id: userId });
}

export async function parkAfk(fromChannelId?: number): Promise<void> {
    await api.post('/voice/afk', fromChannelId ? { from_channel_id: fromChannelId } : {});
}

export async function unparkAfk(): Promise<void> {
    await api.delete('/voice/afk');
}
