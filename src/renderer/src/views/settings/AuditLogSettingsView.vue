<!-- AuditLogSettingsView - View moderation action history -->

<script setup lang="ts">
import { useQuery } from '@pinia/colada';
import { format } from 'date-fns';
import { ScrollText } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getApiErrorMessage } from '@/api/errors';
import type { AuditLogEntry } from '@/api/settings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { currentDateFnsLocale } from '@/i18n';
import { settingsAuditLogQuery } from '@/queries/settings/auditLog';

const { t } = useI18n();

const actionFilter = ref<string>('all');
const currentPage = ref(1);

const queryFilters = computed(() => ({
    action: actionFilter.value === 'all' ? undefined : actionFilter.value,
    page: currentPage.value,
    per_page: 25,
}));

const { data: auditData, isLoading, error } = useQuery(() => settingsAuditLogQuery(queryFilters.value));

const errorMsg = computed(() => {
    if (error.value) return getApiErrorMessage(error.value);
    return '';
});

const entries = computed<AuditLogEntry[]>(() => {
    return auditData.value?.data ?? [];
});

const hasNextPage = computed(() => !!auditData.value?.next_page_url);
const hasPrevPage = computed(() => !!auditData.value?.prev_page_url);

// Reset page when filter changes
watch(actionFilter, () => {
    currentPage.value = 1;
});

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

const actionBadgeVariant: Record<string, BadgeVariant> = {
    ban: 'destructive',
    unban: 'secondary',
    jail: 'destructive',
    unjail: 'secondary',
    message_delete: 'destructive',
    thread_message_delete: 'destructive',
    role_assign: 'default',
    role_remove: 'outline',
    role_create: 'default',
    role_update: 'secondary',
    role_delete: 'destructive',
    channel_create: 'default',
    channel_update: 'secondary',
    channel_delete: 'destructive',
    channel_override_update: 'secondary',
    channel_override_delete: 'destructive',
};

function getActionLabel(action: string): string {
    const key = `settings.auditLog.actions.${action}`;
    const translated = t(key);
    return translated === key ? action : translated;
}

function getBadgeVariant(action: string): BadgeVariant {
    return actionBadgeVariant[action] ?? 'secondary';
}

function getTargetDescription(entry: AuditLogEntry): string {
    const meta = entry.metadata ?? {};
    const targetName = entry.target_user?.username ?? (meta.target_username as string) ?? null;

    switch (entry.action) {
        case 'ban':
        case 'unban':
        case 'jail':
        case 'unjail':
            return targetName ? `@${targetName}` : t('settings.auditLog.target.unknownUser');
        case 'message_delete':
        case 'thread_message_delete':
            if (targetName) {
                return meta.channel_name
                    ? t('settings.auditLog.target.messageByInChannel', {
                          user: targetName,
                          channel: meta.channel_name as string,
                      })
                    : t('settings.auditLog.target.messageBy', { user: targetName });
            }
            return meta.channel_name
                ? t('settings.auditLog.target.messageInChannel', { channel: meta.channel_name as string })
                : t('settings.auditLog.target.messageGeneric');
        case 'role_assign':
        case 'role_remove': {
            const roleName = (meta.role_name as string) ?? t('settings.auditLog.target.roleFallback');
            return targetName
                ? t('settings.auditLog.target.roleOnUser', { role: roleName, user: targetName })
                : t('settings.auditLog.target.roleOnly', { role: roleName });
        }
        case 'role_create':
        case 'role_update':
        case 'role_delete':
            return (meta.role_name as string) ?? t('settings.auditLog.target.roleFallback');
        case 'channel_create':
        case 'channel_update':
        case 'channel_delete':
        case 'channel_override_update':
        case 'channel_override_delete':
            return meta.channel_name
                ? t('settings.auditLog.target.channelName', { name: meta.channel_name as string })
                : t('settings.auditLog.target.channelFallback');
        default:
            return targetName ? `@${targetName}` : '';
    }
}

function getMetaDetails(entry: AuditLogEntry): string[] {
    const details: string[] = [];
    const meta = entry.metadata ?? {};

    if (meta.reason) details.push(t('settings.auditLog.meta.reason', { reason: meta.reason as string }));
    if (meta.expires_at)
        details.push(t('settings.auditLog.meta.expires', { date: formatDate(meta.expires_at as string) }));
    if (meta.role_name && ['role_assign', 'role_remove'].includes(entry.action)) {
        // role_name already shown in target description
    }

    return details;
}

function formatDate(dateStr: string): string {
    return format(new Date(dateStr), 'PP p', { locale: currentDateFnsLocale.value });
}

function formatRelativeDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('settings.auditLog.relative.justNow');
    if (diffMins < 60) return t('settings.auditLog.relative.minutesAgo', { n: diffMins });
    if (diffHours < 24) return t('settings.auditLog.relative.hoursAgo', { n: diffHours });
    if (diffDays < 7) return t('settings.auditLog.relative.daysAgo', { n: diffDays });
    return formatDate(dateStr);
}

const filterOptions = computed<{ value: string; label: string }[]>(() => [
    { value: 'all', label: t('settings.auditLog.filters.all') },
    { value: 'ban', label: t('settings.auditLog.filters.ban') },
    { value: 'unban', label: t('settings.auditLog.filters.unban') },
    { value: 'jail', label: t('settings.auditLog.filters.jail') },
    { value: 'unjail', label: t('settings.auditLog.filters.unjail') },
    { value: 'message_delete', label: t('settings.auditLog.filters.message_delete') },
    { value: 'role_assign', label: t('settings.auditLog.filters.role_assign') },
    { value: 'role_remove', label: t('settings.auditLog.filters.role_remove') },
    { value: 'role_create', label: t('settings.auditLog.filters.role_create') },
    { value: 'role_update', label: t('settings.auditLog.filters.role_update') },
    { value: 'role_delete', label: t('settings.auditLog.filters.role_delete') },
    { value: 'channel_create', label: t('settings.auditLog.filters.channel_create') },
    { value: 'channel_update', label: t('settings.auditLog.filters.channel_update') },
    { value: 'channel_delete', label: t('settings.auditLog.filters.channel_delete') },
]);
</script>

<template>
    <div class="space-y-6">
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">{{ t('settings.auditLog.title') }}</h2>
                <p class="text-muted-foreground mt-1 text-sm">
                    {{ t('settings.auditLog.description') }}
                </p>
            </div>

            <div class="p-6">
                <!-- Filter -->
                <div class="mb-4">
                    <Select v-model="actionFilter">
                        <SelectTrigger class="w-56">
                            <SelectValue :placeholder="t('settings.auditLog.filterPlaceholder')" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem v-for="option in filterOptions" :key="option.value" :value="option.value">
                                {{ option.label }}
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <!-- Error -->
                <div
                    v-if="errorMsg"
                    class="border-destructive/50 bg-destructive/10 text-destructive mb-4 rounded-md border px-4 py-3 text-sm"
                >
                    {{ errorMsg }}
                </div>

                <!-- Loading -->
                <div v-if="isLoading" class="text-muted-foreground text-sm">
                    {{ t('settings.auditLog.loading') }}
                </div>

                <!-- Empty state -->
                <div
                    v-else-if="entries.length === 0"
                    class="flex flex-col items-center justify-center py-8 text-center"
                >
                    <div class="border-border bg-muted mb-3 rounded-full border p-3">
                        <ScrollText class="text-muted-foreground h-6 w-6" />
                    </div>
                    <p class="text-sm font-medium">{{ t('settings.auditLog.emptyTitle') }}</p>
                    <p class="text-muted-foreground mt-1 text-sm">{{ t('settings.auditLog.emptyDescription') }}</p>
                </div>

                <!-- Entries -->
                <div v-else class="space-y-2">
                    <div
                        v-for="entry in entries"
                        :key="entry.id"
                        class="border-border bg-background rounded-lg border p-4"
                    >
                        <div class="flex items-start justify-between gap-4">
                            <div class="min-w-0 flex-1">
                                <div class="flex flex-wrap items-center gap-2">
                                    <Badge :variant="getBadgeVariant(entry.action)" class="text-xs">
                                        {{ getActionLabel(entry.action) }}
                                    </Badge>
                                    <span class="text-sm">
                                        <span class="font-medium">{{
                                            entry.actor?.username ?? t('settings.auditLog.unknownActor')
                                        }}</span>
                                        <span class="text-muted-foreground"> &rarr; </span>
                                        <span class="font-medium">{{ getTargetDescription(entry) }}</span>
                                    </span>
                                </div>
                                <div v-if="getMetaDetails(entry).length > 0" class="text-muted-foreground mt-1 text-xs">
                                    <span v-for="(detail, i) in getMetaDetails(entry)" :key="i">
                                        <span v-if="i > 0" class="mx-1">&middot;</span>
                                        {{ detail }}
                                    </span>
                                </div>
                            </div>
                            <span class="text-muted-foreground shrink-0 text-xs" :title="formatDate(entry.created_at)">
                                {{ formatRelativeDate(entry.created_at) }}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Pagination -->
                <div
                    v-if="entries.length > 0 && (hasPrevPage || hasNextPage)"
                    class="mt-4 flex items-center justify-between"
                >
                    <Button variant="outline" size="sm" :disabled="!hasPrevPage || isLoading" @click="currentPage--">
                        {{ t('settings.auditLog.previous') }}
                    </Button>
                    <span class="text-muted-foreground text-xs">{{
                        t('settings.auditLog.page', { n: currentPage })
                    }}</span>
                    <Button variant="outline" size="sm" :disabled="!hasNextPage || isLoading" @click="currentPage++">
                        {{ t('settings.auditLog.next') }}
                    </Button>
                </div>
            </div>
        </div>
    </div>
</template>
