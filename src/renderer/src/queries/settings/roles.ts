import { defineQueryOptions } from '@pinia/colada';
import { getRoles } from '@/api/settings';
import { SETTINGS_KEYS } from '@/queries/keys';

export const rolesQuery = defineQueryOptions({
    key: SETTINGS_KEYS.roles(),
    query: () => getRoles(),
});
