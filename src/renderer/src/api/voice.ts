import api from './client';

export async function getVoiceParticipants(): Promise<
    Record<
        string,
        Array<{
            id: number;
            username: string;
            display_name: string;
            avatar_urls: { thumb: string; small: string; medium: string; original: string } | null;
        }>
    >
> {
    const r = await api.get('/voice/participants');
    return r.data?.data ?? {};
}

export async function joinVoiceChannel(
    channelId: number,
): Promise<{ token: string; url: string; e2ee_key: string; e2ee_key_index: number }> {
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

export async function parkAfk(fromChannelId?: number): Promise<void> {
    await api.post('/voice/afk', fromChannelId ? { from_channel_id: fromChannelId } : {});
}

export async function unparkAfk(): Promise<void> {
    await api.delete('/voice/afk');
}
