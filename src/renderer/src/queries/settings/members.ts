import { defineQueryOptions } from '@pinia/colada';
import { getSettingsMembers } from '@/api/settings';
import { SETTINGS_KEYS } from '@/queries/keys';

export const settingsMembersQuery = defineQueryOptions({
    key: SETTINGS_KEYS.members(),
    query: () => getSettingsMembers(),
});
