import { defineQueryOptions } from '@pinia/colada';
import { getSettingsChannels } from '@/api/settings';
import { SETTINGS_KEYS } from '@/queries/keys';

export const settingsChannelsQuery = defineQueryOptions({
    key: SETTINGS_KEYS.channels(),
    query: () => getSettingsChannels(),
});
