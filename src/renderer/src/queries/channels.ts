import { defineQueryOptions } from '@pinia/colada';
import { getChannel } from '@/api/channels';
import { CHANNEL_KEYS } from './keys';

export const channelQuery = defineQueryOptions((id: string) => ({
    key: CHANNEL_KEYS.byId(id),
    query: () => getChannel(id),
}));
