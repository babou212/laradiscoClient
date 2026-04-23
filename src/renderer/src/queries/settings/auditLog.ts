import { defineQueryOptions } from '@pinia/colada';
import { getAuditLog } from '@/api/settings';
import { SETTINGS_KEYS } from '@/queries/keys';

export const settingsAuditLogQuery = defineQueryOptions(
    (filters: { action?: string; page?: number; per_page?: number }) => ({
        key: SETTINGS_KEYS.auditLog(filters),
        query: () => getAuditLog(filters),
    }),
);
