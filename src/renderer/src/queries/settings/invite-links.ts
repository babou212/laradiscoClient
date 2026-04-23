import { defineQueryOptions } from '@pinia/colada';
import { getInviteLinks } from '@/api/settings';
import { SETTINGS_KEYS } from '@/queries/keys';

export const inviteLinksQuery = defineQueryOptions({
    key: SETTINGS_KEYS.inviteLinks(),
    query: () => getInviteLinks(),
});
