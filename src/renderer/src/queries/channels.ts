import { defineQueryOptions } from '@pinia/colada';
import { CHANNEL_KEYS } from './keys';
import { getChannel } from '@/api/channels';

export const channelQuery = defineQueryOptions((id: string) => ({
    key: CHANNEL_KEYS.byId(id),
    query: () => getChannel(id),
}));
