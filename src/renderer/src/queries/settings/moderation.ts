import { defineQueryOptions } from '@pinia/colada';
import { getBans } from '@/api/settings';
import { SETTINGS_KEYS } from '@/queries/keys';

export const settingsBansQuery = defineQueryOptions({
    key: SETTINGS_KEYS.bans(),
    query: () => getBans(),
});
