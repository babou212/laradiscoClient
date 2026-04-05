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

export async function joinVoiceChannel(channelId: number): Promise<{ token: string; url: string; e2ee_key: string }> {
    const r = await api.post(`/channels/${channelId}/voice/join`);
    return r.data?.data ?? r.data;
}

export function leaveVoiceMembership(channelId: number): Promise<void> {
    return api.delete(`/channels/${channelId}/voice/membership`);
}
