import api from './client';

export function sendChannelTyping(channelId: string | number): Promise<void> {
    return api.post(`/channels/${channelId}/typing`);
}

export function sendDmTyping(groupId: string | number): Promise<void> {
    return api.post(`/direct-messages/${groupId}/typing`);
}

export function sendThreadTyping(
    channelId: string | number,
    threadId: string | number,
): Promise<void> {
    return api.post(`/channels/${channelId}/threads/${threadId}/typing`);
}
