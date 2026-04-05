import { defineQueryOptions } from '@pinia/colada';
import { CHANNEL_KEYS } from './keys';
import { getMessages } from '@/api/messages';

export const messagesQuery = defineQueryOptions((channelId: string) => ({
    key: CHANNEL_KEYS.messages(channelId),
    query: () => getMessages(channelId),
}));
