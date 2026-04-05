import { defineQueryOptions } from '@pinia/colada';
import { USER_KEYS } from './keys';
import { getUserProfile } from '@/api/users';

export const userProfileQuery = defineQueryOptions((id: string) => ({
    key: USER_KEYS.byId(id),
    query: () => getUserProfile(id),
}));
