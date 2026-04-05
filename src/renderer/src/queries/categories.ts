import { defineQueryOptions } from '@pinia/colada';
import { CATEGORY_KEYS } from './keys';
import { getCategories } from '@/api/categories';

export const categoriesQuery = defineQueryOptions({
    key: CATEGORY_KEYS.list(),
    query: () => getCategories({ include: 'channels' }),
});
