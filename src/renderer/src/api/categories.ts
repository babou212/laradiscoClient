import api from './client';
import type {
    CategoryResource,
    JsonApiCollectionResponse,
    JsonApiResponse,
} from './types';

export interface CreateCategoryData {
    name: string;
    position?: number;
}

export interface UpdateCategoryData {
    name?: string;
    position?: number;
}

export async function getCategories(params?: {
    sort?: string;
    include?: string;
}): Promise<JsonApiCollectionResponse<CategoryResource>> {
    const r = await api
        .get('/categories', { params: { sort: 'position', ...params } });
    return r.data;
}

export async function createCategory(
    data: CreateCategoryData,
): Promise<JsonApiResponse<CategoryResource>> {
    const r = await api.post('/settings/categories', data);
    return r.data;
}

export async function updateCategory(
    id: string,
    data: UpdateCategoryData,
): Promise<JsonApiResponse<CategoryResource>> {
    const r = await api.put(`/settings/categories/${id}`, data);
    return r.data;
}
