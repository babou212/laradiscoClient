import { defineQueryOptions } from '@pinia/colada';
import { getUserProfile } from '@/api/users';
import { USER_KEYS } from './keys';

export const userProfileQuery = defineQueryOptions((id: string) => ({
    key: USER_KEYS.byId(id),
    query: () => getUserProfile(id),
}));
