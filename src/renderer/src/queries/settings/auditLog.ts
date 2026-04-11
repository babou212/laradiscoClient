import { defineQueryOptions } from '@pinia/colada';
import { getAuditLog } from '@/api/settings';
import { SETTINGS_KEYS } from '@/queries/keys';

export function settingsAuditLogQuery(filters?: { action?: string; page?: number }) {
    return defineQueryOptions({
        key: SETTINGS_KEYS.auditLog(filters),
        query: () => getAuditLog(filters),
    });
}
