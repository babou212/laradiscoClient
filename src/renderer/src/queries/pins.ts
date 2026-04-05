import { defineQueryOptions } from '@pinia/colada';
import { CHANNEL_KEYS, DM_KEYS } from './keys';
import { getChannelPins, getDmPins } from '@/api/pins';

export const channelPinsQuery = defineQueryOptions((channelId: string) => ({
    key: CHANNEL_KEYS.pins(channelId),
    query: () => getChannelPins(channelId),
}));

export const dmPinsQuery = defineQueryOptions((groupId: string) => ({
    key: DM_KEYS.pins(groupId),
    query: () => getDmPins(groupId),
}));
