import type { AxiosError } from 'axios';
import type { JsonApiError, JsonApiErrorResponse } from './types';

/** Extract JSON:API errors from an Axios error response */
export function extractJsonApiErrors(error: unknown): JsonApiError[] {
    const axiosError = error as AxiosError<JsonApiErrorResponse>;
    return axiosError?.response?.data?.errors ?? [];
}

/** Get the first error message from a JSON:API error response */
export function getApiErrorMessage(error: unknown): string {
    const errors = extractJsonApiErrors(error);
    if (errors.length > 0) {
        return errors[0].detail ?? errors[0].title ?? 'An error occurred';
    }
    const axiosError = error as AxiosError<{ message?: string }>;
    return axiosError?.response?.data?.message ?? axiosError?.message ?? 'An error occurred';
}

/** Extract validation errors as { field: message } map from JSON:API 422 responses */
export function extractValidationErrors(error: unknown): Record<string, string> {
    const errors = extractJsonApiErrors(error);
    const result: Record<string, string> = {};
    for (const err of errors) {
        if (err.source?.pointer) {
            // JSON:API pointer format: /data/attributes/field_name
            const field = err.source.pointer.replace(/^\/data\/attributes\//, '');
            result[field] = err.detail ?? err.title;
        }
    }
    return result;
}

/** Check if an error is a specific HTTP status */
export function isHttpStatus(error: unknown, status: number): boolean {
    return (error as AxiosError)?.response?.status === status;
}
