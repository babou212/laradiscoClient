import { defineQueryOptions } from '@pinia/colada';
import { MEMBER_KEYS, MENTION_KEYS } from './keys';
import { getMembers, searchMentions } from '@/api/members';

export const membersQuery = defineQueryOptions({
    key: MEMBER_KEYS.list(),
    query: () => getMembers(),
});

export const mentionSearchQuery = defineQueryOptions((query: string) => ({
    key: MENTION_KEYS.search(query),
    query: () => searchMentions(query),
    staleTime: 30_000,
}));
