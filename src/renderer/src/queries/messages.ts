import { defineQueryOptions } from '@pinia/colada';
import { getMessages } from '@/api/messages';
import { CHANNEL_KEYS } from './keys';

export const messagesQuery = defineQueryOptions((channelId: string) => ({
    key: CHANNEL_KEYS.messages(channelId),
    query: () => getMessages(channelId),
}));
