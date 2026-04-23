import { defineQueryOptions } from '@pinia/colada';
import { getProfile } from '@/api/settings';
import { SETTINGS_KEYS } from '@/queries/keys';

export const profileQuery = defineQueryOptions({
    key: SETTINGS_KEYS.profile(),
    query: () => getProfile(),
});
