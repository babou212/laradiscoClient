import { defineQueryOptions } from '@pinia/colada';
import { getMembers, searchMentions } from '@/api/members';
import { MEMBER_KEYS, MENTION_KEYS } from './keys';

export const membersQuery = defineQueryOptions({
    key: MEMBER_KEYS.list(),
    query: () => getMembers(),
});

export const mentionSearchQuery = defineQueryOptions((query: string) => ({
    key: MENTION_KEYS.search(query),
    query: () => searchMentions(query),
    staleTime: 30_000,
}));
