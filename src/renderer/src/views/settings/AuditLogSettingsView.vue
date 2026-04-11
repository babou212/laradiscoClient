<!-- AuditLogSettingsView - View moderation action history -->

<script setup lang="ts">
import { useQuery } from '@pinia/colada';
import { ScrollText } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { getApiErrorMessage } from '@/api/errors';
import type { AuditLogEntry } from '@/api/settings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { settingsAuditLogQuery } from '@/queries/settings/auditLog';

const actionFilter = ref<string>('all');
const currentPage = ref(1);

const queryFilters = computed(() => ({
    action: actionFilter.value === 'all' ? undefined : actionFilter.value,
    page: currentPage.value,
    per_page: 25,
}));

const { data: auditData, isLoading, error } = useQuery(computed(() => settingsAuditLogQuery(queryFilters.value)));

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

const actionLabels: Record<string, string> = {
    ban: 'Banned',
    unban: 'Unbanned',
    jail: 'Jailed',
    unjail: 'Unjailed',
    message_delete: 'Deleted Message',
    thread_message_delete: 'Deleted Thread Reply',
    role_assign: 'Assigned Role',
    role_remove: 'Removed Role',
    role_create: 'Created Role',
    role_update: 'Updated Role',
    role_delete: 'Deleted Role',
    channel_create: 'Created Channel',
    channel_update: 'Updated Channel',
    channel_delete: 'Deleted Channel',
    channel_override_update: 'Updated Channel Override',
    channel_override_delete: 'Deleted Channel Override',
};

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
    return actionLabels[action] ?? action;
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
            return targetName ? `@${targetName}` : 'Unknown user';
        case 'message_delete':
        case 'thread_message_delete':
            return targetName
                ? `message by @${targetName}${meta.channel_name ? ` in #${meta.channel_name}` : ''}`
                : `message${meta.channel_name ? ` in #${meta.channel_name}` : ''}`;
        case 'role_assign':
        case 'role_remove':
            return `${meta.role_name ?? 'role'}${targetName ? ` on @${targetName}` : ''}`;
        case 'role_create':
        case 'role_update':
        case 'role_delete':
            return (meta.role_name as string) ?? 'role';
        case 'channel_create':
        case 'channel_update':
        case 'channel_delete':
        case 'channel_override_update':
        case 'channel_override_delete':
            return meta.channel_name ? `#${meta.channel_name}` : 'channel';
        default:
            return targetName ? `@${targetName}` : '';
    }
}

function getMetaDetails(entry: AuditLogEntry): string[] {
    const details: string[] = [];
    const meta = entry.metadata ?? {};

    if (meta.reason) details.push(`Reason: ${meta.reason}`);
    if (meta.expires_at) details.push(`Expires: ${formatDate(meta.expires_at as string)}`);
    if (meta.role_name && ['role_assign', 'role_remove'].includes(entry.action)) {
        // role_name already shown in target description
    }

    return details;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function formatRelativeDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateStr);
}

const filterOptions = [
    { value: 'all', label: 'All Actions' },
    { value: 'ban', label: 'Bans' },
    { value: 'unban', label: 'Unbans' },
    { value: 'jail', label: 'Jails' },
    { value: 'unjail', label: 'Unjails' },
    { value: 'message_delete', label: 'Message Deletions' },
    { value: 'role_assign', label: 'Role Assigned' },
    { value: 'role_remove', label: 'Role Removed' },
    { value: 'role_create', label: 'Role Created' },
    { value: 'role_update', label: 'Role Updated' },
    { value: 'role_delete', label: 'Role Deleted' },
    { value: 'channel_create', label: 'Channel Created' },
    { value: 'channel_update', label: 'Channel Updated' },
    { value: 'channel_delete', label: 'Channel Deleted' },
];
</script>

<template>
    <div class="space-y-6">
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">Audit Log</h2>
                <p class="text-muted-foreground mt-1 text-sm">
                    A record of all moderation and administrative actions taken on the server.
                </p>
            </div>

            <div class="p-6">
                <!-- Filter -->
                <div class="mb-4">
                    <Select v-model="actionFilter">
                        <SelectTrigger class="w-56">
                            <SelectValue placeholder="Filter by action" />
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
                <div v-if="isLoading" class="text-muted-foreground text-sm">Loading...</div>

                <!-- Empty state -->
                <div
                    v-else-if="entries.length === 0"
                    class="flex flex-col items-center justify-center py-8 text-center"
                >
                    <div class="border-border bg-muted mb-3 rounded-full border p-3">
                        <ScrollText class="text-muted-foreground h-6 w-6" />
                    </div>
                    <p class="text-sm font-medium">No audit log entries</p>
                    <p class="text-muted-foreground mt-1 text-sm">Moderation actions will appear here.</p>
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
                                        <span class="font-medium">{{ entry.actor?.username ?? 'Unknown' }}</span>
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
                        Previous
                    </Button>
                    <span class="text-muted-foreground text-xs">Page {{ currentPage }}</span>
                    <Button variant="outline" size="sm" :disabled="!hasNextPage || isLoading" @click="currentPage++">
                        Next
                    </Button>
                </div>
            </div>
        </div>
    </div>
</template>
