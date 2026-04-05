import { defineQueryOptions } from '@pinia/colada';
import { DM_KEYS } from './keys';
import { getDmGroups, getDmMessages } from '@/api/direct-messages';

export const dmGroupsQuery = defineQueryOptions({
    key: DM_KEYS.groups(),
    query: () => getDmGroups(),
});

export const dmMessagesQuery = defineQueryOptions((groupId: string) => ({
    key: DM_KEYS.messages(groupId),
    query: () => getDmMessages(groupId),
}));
