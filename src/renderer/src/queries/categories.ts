import { defineQueryOptions } from '@pinia/colada';
import { getCategories } from '@/api/categories';
import { CATEGORY_KEYS } from './keys';

export const categoriesQuery = defineQueryOptions({
    key: CATEGORY_KEYS.list(),
    query: () => getCategories({ include: 'channels' }),
});
