<!-- Kick/ban/jail/role-management dialogs triggered from the right-click member context menu (AppContextMenu.vue). -->

<script setup lang="ts">
import { getLocalTimeZone, today, type DateValue } from '@internationalized/date';
import { useQuery, useMutation, useQueryCache } from '@pinia/colada';
import { useEventListener } from '@vueuse/core';
import { CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-vue-next';
import {
    DatePickerAnchor,
    DatePickerCalendar,
    DatePickerCell,
    DatePickerCellTrigger,
    DatePickerContent,
    DatePickerGrid,
    DatePickerGridBody,
    DatePickerGridHead,
    DatePickerGridRow,
    DatePickerHeadCell,
    DatePickerHeader,
    DatePickerHeading,
    DatePickerNext,
    DatePickerPrev,
    DatePickerRoot,
    DatePickerTrigger,
} from 'reka-ui';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getApiErrorMessage } from '@/api/errors';
import { banUser, jailUser, unjailUser, deleteMember, updateMemberRole, removeMemberRole } from '@/api/settings';
import { findIncluded, relationshipIds } from '@/api/types';
import type { RoleResource } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SETTINGS_KEYS } from '@/queries/keys';
import { settingsMembersQuery } from '@/queries/settings/members';
import { useAuthStore } from '@/stores/auth';
import { useUsersStore } from '@/stores/users';

const { t } = useI18n();
const queryCache = useQueryCache();
const usersStore = useUsersStore();
const authStore = useAuthStore();

type Role = { id: string; name: string; color: string; is_default: boolean };
type MemberRole = { id: string; name: string; color: string };
type Member = { id: string; username: string; display_name: string; roles: MemberRole[] };

// Only fetch the member/role list (an admin-only endpoint) when this user could
// actually open one of the dialogs below — avoids a 403 on every chat load for
// regular members.
const canManageMembers = computed(() => {
    const perms = authStore.user?.permissions;
    return !!perms?.isAdministrator || !!perms?.canManageRoles || !!perms?.canKickMembers || !!perms?.canBanMembers;
});

const { data: rawData } = useQuery({ ...settingsMembersQuery, enabled: canManageMembers });

const allRoles = computed<Role[]>(() => {
    const metaRoles = rawData.value?.meta?.roles;
    if (!Array.isArray(metaRoles)) return [];
    return metaRoles.map((r: any) => ({
        id: String(r.id),
        name: r.attributes?.name ?? r.name ?? '',
        color: r.attributes?.color ?? r.color ?? '#99AAB5',
        is_default: r.attributes?.is_default ?? r.is_default ?? false,
    }));
});

const members = computed<Member[]>(() => {
    if (!rawData.value?.data) return [];
    return rawData.value.data.map((res) => {
        const roleIds = relationshipIds(res.relationships?.roles);
        const roles: MemberRole[] = roleIds
            .map((rid) => findIncluded<RoleResource>(rawData.value!.included, 'roles', rid))
            .filter(Boolean)
            .map((r) => ({ id: r!.id, name: r!.attributes.name, color: r!.attributes.color }));
        return {
            id: res.id,
            username: res.attributes.username,
            display_name: res.attributes.display_name ?? res.attributes.username,
            roles,
        };
    });
});

function findMember(userId: string, fallbackUsername: string): Member {
    return (
        members.value.find((m) => m.id === userId) ?? {
            id: userId,
            username: fallbackUsername,
            display_name: fallbackUsername,
            roles: [],
        }
    );
}

const actionError = ref('');

// --- Kick (permanently delete the member) ---
const showKickDialog = ref(false);
const kickTarget = ref<Member | null>(null);

const { mutateAsync: doKick, isLoading: kicking } = useMutation({
    mutation: (userId: string) => deleteMember(userId),
    onSuccess: (_data, userId) => {
        const target = members.value.find((m) => m.id === userId);
        usersStore.applyUserDeleted({ user_id: userId, username: target?.username ?? '' });
        queryCache.invalidateQueries({ key: SETTINGS_KEYS.members() });
        queryCache.invalidateQueries({ key: SETTINGS_KEYS.bans() });
    },
});

function openKickDialog(userId: string, username: string) {
    kickTarget.value = findMember(userId, username);
    actionError.value = '';
    showKickDialog.value = true;
}

async function confirmKick() {
    if (!kickTarget.value) return;
    actionError.value = '';
    try {
        await doKick(kickTarget.value.id);
        showKickDialog.value = false;
        kickTarget.value = null;
    } catch (err: unknown) {
        actionError.value = getApiErrorMessage(err);
    }
}

// --- Ban ---
const showBanDialog = ref(false);
const banTarget = ref<Member | null>(null);
const banReason = ref('');
const banExpiry = ref<DateValue | undefined>();
const minDate = today(getLocalTimeZone());

type BanPreset = { key: string; labelKey: string; hours: number | null };
const banPresets: BanPreset[] = [
    { key: 'hour', labelKey: 'settings.moderation.banDialog.presetHour', hours: 1 },
    { key: 'day', labelKey: 'settings.moderation.banDialog.presetDay', hours: 24 },
    { key: 'week', labelKey: 'settings.moderation.banDialog.presetWeek', hours: 24 * 7 },
    { key: 'month', labelKey: 'settings.moderation.banDialog.presetMonth', hours: 24 * 30 },
    { key: 'permanent', labelKey: 'settings.moderation.banDialog.presetPermanent', hours: null },
];
const presetHours = ref<number | null | undefined>(undefined);

function selectPreset(preset: BanPreset): void {
    presetHours.value = preset.hours;
    banExpiry.value = undefined;
}

function onCalendarExpiry(value: DateValue | undefined): void {
    banExpiry.value = value;
    // Choosing a custom date supersedes any preset selection.
    presetHours.value = undefined;
}

function formatExpiryForApi(date: DateValue | undefined): string | undefined {
    if (!date) return undefined;
    const jsDate = date.toDate(getLocalTimeZone());
    jsDate.setHours(23, 59, 59);
    return jsDate.toISOString();
}

function resolveExpiry(): string | undefined {
    if (presetHours.value === null) return undefined; // explicit permanent
    if (typeof presetHours.value === 'number') {
        return new Date(Date.now() + presetHours.value * 3600 * 1000).toISOString();
    }
    return formatExpiryForApi(banExpiry.value);
}

const { mutateAsync: doBan, isLoading: banning } = useMutation({
    mutation: (params: { userId: string; reason?: string; expires_at?: string }) =>
        banUser(params.userId, { reason: params.reason, expires_at: params.expires_at }),
    onSuccess: () => {
        queryCache.invalidateQueries({ key: SETTINGS_KEYS.bans() });
        queryCache.invalidateQueries({ key: SETTINGS_KEYS.members() });
    },
});

function openBanDialog(userId: string, username: string) {
    banTarget.value = findMember(userId, username);
    banReason.value = '';
    banExpiry.value = undefined;
    presetHours.value = undefined;
    actionError.value = '';
    showBanDialog.value = true;
}

async function confirmBan() {
    if (!banTarget.value) return;
    actionError.value = '';
    try {
        await doBan({ userId: banTarget.value.id, reason: banReason.value || undefined, expires_at: resolveExpiry() });
        showBanDialog.value = false;
        banTarget.value = null;
    } catch (err: unknown) {
        actionError.value = getApiErrorMessage(err);
    }
}

// --- Jail ---
const showJailDialog = ref(false);
const jailTarget = ref<Member | null>(null);

const { mutateAsync: doJail, isLoading: jailing } = useMutation({
    mutation: (userId: string) => jailUser(userId),
    onSuccess: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.members() }),
});

function openJailDialog(userId: string, username: string) {
    jailTarget.value = findMember(userId, username);
    actionError.value = '';
    showJailDialog.value = true;
}

async function confirmJail() {
    if (!jailTarget.value) return;
    actionError.value = '';
    try {
        await doJail(jailTarget.value.id);
        showJailDialog.value = false;
        jailTarget.value = null;
    } catch (err: unknown) {
        actionError.value = getApiErrorMessage(err);
    }
}

// --- Release (unjail) ---
const showReleaseDialog = ref(false);
const releaseTarget = ref<Member | null>(null);

const { mutateAsync: doRelease, isLoading: releasing } = useMutation({
    mutation: (userId: string) => unjailUser(userId),
    onSuccess: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.members() }),
});

function openReleaseDialog(userId: string, username: string) {
    releaseTarget.value = findMember(userId, username);
    actionError.value = '';
    showReleaseDialog.value = true;
}

async function confirmRelease() {
    if (!releaseTarget.value) return;
    actionError.value = '';
    try {
        await doRelease(releaseTarget.value.id);
        showReleaseDialog.value = false;
        releaseTarget.value = null;
    } catch (err: unknown) {
        actionError.value = getApiErrorMessage(err);
    }
}

// --- Manage roles ---
const showRolesDialog = ref(false);
const showRemoveRoleDialog = ref(false);
const rolesTargetId = ref<string | null>(null);
const rolesTargetUsername = ref('');
const removingRole = ref<MemberRole | null>(null);

const currentMember = computed<Member | null>(() => {
    if (!rolesTargetId.value) return null;
    return findMember(rolesTargetId.value, rolesTargetUsername.value);
});

const { mutateAsync: doAssignRole, isLoading: assigningRole } = useMutation({
    mutation: (params: { memberId: string; roleId: string }) => updateMemberRole(params.memberId, params.roleId),
    onSuccess: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.members() }),
});

const { mutateAsync: doRemoveRole, isLoading: removingRoleLoading } = useMutation({
    mutation: (params: { memberId: string; roleId: string }) => removeMemberRole(params.memberId, params.roleId),
    onSuccess: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.members() }),
});

function openRolesDialog(userId: string, username: string) {
    rolesTargetId.value = userId;
    rolesTargetUsername.value = username;
    actionError.value = '';
    showRolesDialog.value = true;
}

function getAvailableRoles(member: Member): Role[] {
    const memberRoleIds = new Set(member.roles.map((r) => r.id));
    return allRoles.value.filter((r) => !memberRoleIds.has(r.id) && !r.is_default);
}

function isDefaultRole(role: MemberRole): boolean {
    const matchedRole = allRoles.value.find((r) => r.id === role.id);
    return matchedRole?.is_default ?? role.name === 'everyone';
}

async function doAssignRoleAction(roleId: string) {
    if (!rolesTargetId.value) return;
    actionError.value = '';
    try {
        await doAssignRole({ memberId: rolesTargetId.value, roleId });
    } catch (err: unknown) {
        actionError.value = getApiErrorMessage(err);
    }
}

function openRemoveRoleDialog(role: MemberRole) {
    removingRole.value = role;
    actionError.value = '';
    showRemoveRoleDialog.value = true;
}

async function confirmRemoveRole() {
    if (!rolesTargetId.value || !removingRole.value) return;
    actionError.value = '';
    try {
        await doRemoveRole({ memberId: rolesTargetId.value, roleId: removingRole.value.id });
        showRemoveRoleDialog.value = false;
        removingRole.value = null;
    } catch (err: unknown) {
        actionError.value = getApiErrorMessage(err);
    }
}

// --- Event wiring (dispatched by AppContextMenu.vue's username context menu) ---
function handleUserAdminAction(e: Event) {
    const detail = (e as CustomEvent<{ action: string; userId: string; username: string }>).detail;
    if (!detail) return;
    switch (detail.action) {
        case 'kick':
            openKickDialog(detail.userId, detail.username);
            break;
        case 'ban':
            openBanDialog(detail.userId, detail.username);
            break;
        case 'jail':
            openJailDialog(detail.userId, detail.username);
            break;
        case 'release':
            openReleaseDialog(detail.userId, detail.username);
            break;
        case 'manage-roles':
            openRolesDialog(detail.userId, detail.username);
            break;
    }
}

useEventListener(document, 'chat-user-action', handleUserAdminAction);
</script>

<template>
    <Dialog v-model:open="showKickDialog">
        <DialogContent class="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>{{ t('appContextMenu.kickDialog.title') }}</DialogTitle>
                <DialogDescription>
                    {{ t('appContextMenu.kickDialog.description', { name: kickTarget?.display_name ?? '' }) }}
                </DialogDescription>
            </DialogHeader>

            <div
                v-if="actionError"
                class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
            >
                {{ actionError }}
            </div>

            <DialogFooter>
                <Button variant="outline" @click="showKickDialog = false">{{ t('settings.common.cancel') }}</Button>
                <Button variant="destructive" :disabled="kicking" @click="confirmKick">{{
                    t('appContextMenu.kickDialog.submit')
                }}</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <Dialog v-model:open="showBanDialog">
        <DialogContent class="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>{{ t('settings.moderation.banDialog.title') }}</DialogTitle>
                <DialogDescription>
                    {{ t('settings.moderation.banDialog.description', { name: banTarget?.display_name ?? '' }) }}
                </DialogDescription>
            </DialogHeader>

            <div
                v-if="actionError"
                class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
            >
                {{ actionError }}
            </div>

            <div class="space-y-4">
                <div class="space-y-2">
                    <Label for="ctx-ban-reason">{{ t('settings.moderation.banDialog.reason') }}</Label>
                    <Input
                        id="ctx-ban-reason"
                        v-model="banReason"
                        :placeholder="t('settings.moderation.banDialog.reasonPlaceholder')"
                    />
                </div>
                <div class="space-y-2">
                    <Label>{{ t('settings.moderation.banDialog.duration') }}</Label>
                    <div class="flex flex-wrap gap-2">
                        <Button
                            v-for="preset in banPresets"
                            :key="preset.key"
                            type="button"
                            size="sm"
                            :variant="presetHours === preset.hours ? 'default' : 'outline'"
                            @click="selectPreset(preset)"
                        >
                            {{ t(preset.labelKey) }}
                        </Button>
                    </div>
                </div>
                <div class="space-y-2">
                    <Label>{{ t('settings.moderation.banDialog.expires') }}</Label>
                    <DatePickerRoot :model-value="banExpiry" :min-value="minDate" @update:model-value="onCalendarExpiry">
                        <DatePickerAnchor>
                            <DatePickerTrigger
                                class="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-9 w-full items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-xs"
                            >
                                <CalendarIcon class="size-4 opacity-50" />
                                <span v-if="banExpiry">{{ banExpiry.toString() }}</span>
                                <span v-else class="text-muted-foreground">{{
                                    t('settings.moderation.banDialog.pickDate')
                                }}</span>
                            </DatePickerTrigger>

                            <DatePickerContent
                                :side-offset="8"
                                class="bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 z-50 rounded-md border p-3 shadow-md"
                            >
                                <DatePickerCalendar v-slot="{ weekDays, grid }">
                                    <DatePickerHeader class="flex items-center justify-between pb-2">
                                        <DatePickerPrev
                                            class="hover:bg-accent hover:text-accent-foreground inline-flex size-7 items-center justify-center rounded-md"
                                        >
                                            <ChevronLeft class="size-4" />
                                        </DatePickerPrev>
                                        <DatePickerHeading class="text-sm font-medium" />
                                        <DatePickerNext
                                            class="hover:bg-accent hover:text-accent-foreground inline-flex size-7 items-center justify-center rounded-md"
                                        >
                                            <ChevronRight class="size-4" />
                                        </DatePickerNext>
                                    </DatePickerHeader>

                                    <DatePickerGrid
                                        v-for="month in grid"
                                        :key="month.value.toString()"
                                        class="w-full border-collapse"
                                    >
                                        <DatePickerGridHead>
                                            <DatePickerGridRow class="flex">
                                                <DatePickerHeadCell
                                                    v-for="day in weekDays"
                                                    :key="day"
                                                    class="text-muted-foreground w-8 text-center text-xs font-normal"
                                                >
                                                    {{ day }}
                                                </DatePickerHeadCell>
                                            </DatePickerGridRow>
                                        </DatePickerGridHead>
                                        <DatePickerGridBody>
                                            <DatePickerGridRow
                                                v-for="(weekDates, index) in month.rows"
                                                :key="`weekDate-${index}`"
                                                class="flex"
                                            >
                                                <DatePickerCell
                                                    v-for="weekDate in weekDates"
                                                    :key="weekDate.toString()"
                                                    :date="weekDate"
                                                    class="relative p-0"
                                                >
                                                    <DatePickerCellTrigger
                                                        :day="weekDate"
                                                        :month="month.value"
                                                        class="hover:bg-accent hover:text-accent-foreground data-[outside-month]:text-muted-foreground/50 data-[selected]:bg-primary data-[selected]:text-primary-foreground inline-flex size-8 items-center justify-center rounded-md text-sm data-[disabled]:pointer-events-none data-[disabled]:opacity-30 data-[selected]:font-medium data-[today]:font-semibold"
                                                    />
                                                </DatePickerCell>
                                            </DatePickerGridRow>
                                        </DatePickerGridBody>
                                    </DatePickerGrid>
                                </DatePickerCalendar>
                            </DatePickerContent>
                        </DatePickerAnchor>
                    </DatePickerRoot>
                    <p class="text-muted-foreground text-xs">
                        {{ t('settings.moderation.banDialog.permanentHint') }}
                    </p>
                </div>
            </div>

            <DialogFooter>
                <Button variant="outline" @click="showBanDialog = false">{{ t('settings.common.cancel') }}</Button>
                <Button variant="destructive" :disabled="banning" @click="confirmBan">{{
                    t('settings.moderation.banDialog.submit')
                }}</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <Dialog v-model:open="showJailDialog">
        <DialogContent class="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>{{ t('settings.moderation.jailDialog.title') }}</DialogTitle>
                <DialogDescription>
                    {{ t('settings.moderation.jailDialog.description', { name: jailTarget?.display_name ?? '' }) }}
                </DialogDescription>
            </DialogHeader>

            <div
                v-if="actionError"
                class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
            >
                {{ actionError }}
            </div>

            <DialogFooter>
                <Button variant="outline" @click="showJailDialog = false">{{ t('settings.common.cancel') }}</Button>
                <Button variant="destructive" :disabled="jailing" @click="confirmJail">{{
                    t('settings.moderation.jailDialog.submit')
                }}</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <Dialog v-model:open="showReleaseDialog">
        <DialogContent class="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>{{ t('appContextMenu.releaseDialog.title') }}</DialogTitle>
                <DialogDescription>
                    {{ t('appContextMenu.releaseDialog.description', { name: releaseTarget?.display_name ?? '' }) }}
                </DialogDescription>
            </DialogHeader>

            <div
                v-if="actionError"
                class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
            >
                {{ actionError }}
            </div>

            <DialogFooter>
                <Button variant="outline" @click="showReleaseDialog = false">{{ t('settings.common.cancel') }}</Button>
                <Button :disabled="releasing" @click="confirmRelease">{{
                    t('appContextMenu.releaseDialog.submit')
                }}</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <Dialog v-model:open="showRolesDialog">
        <DialogContent class="sm:max-w-sm">
            <DialogHeader>
                <DialogTitle>{{ t('settings.members.manage.title') }}</DialogTitle>
                <DialogDescription>
                    {{ t('settings.members.manage.description', { name: currentMember?.display_name ?? '' }) }}
                </DialogDescription>
            </DialogHeader>

            <div
                v-if="actionError"
                class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
            >
                {{ actionError }}
            </div>

            <div class="space-y-2">
                <Label>{{ t('settings.members.manage.currentRoles') }}</Label>
                <div v-if="!currentMember?.roles.length" class="text-muted-foreground text-sm">
                    {{ t('settings.members.manage.noRoles') }}
                </div>
                <div v-else class="flex flex-wrap gap-1">
                    <Badge
                        v-for="role in currentMember.roles"
                        :key="role.id"
                        variant="outline"
                        :class="['gap-1 text-xs', isDefaultRole(role) ? '' : 'hover:bg-destructive/10 cursor-pointer']"
                        @click="!isDefaultRole(role) && openRemoveRoleDialog(role)"
                    >
                        <div class="h-2 w-2 rounded-full" :style="{ backgroundColor: role.color }" />
                        {{ role.name }}
                        <X v-if="!isDefaultRole(role)" class="h-3 w-3" />
                    </Badge>
                </div>
            </div>

            <div class="space-y-2">
                <Label>{{ t('settings.members.assign.title') }}</Label>
                <div
                    v-if="currentMember && getAvailableRoles(currentMember).length === 0"
                    class="text-muted-foreground py-2 text-center text-sm"
                >
                    {{ t('settings.members.assign.allAssigned') }}
                </div>
                <Select
                    v-else
                    :disabled="assigningRole"
                    @update:model-value="(val) => typeof val === 'string' && doAssignRoleAction(val)"
                >
                    <SelectTrigger>
                        <SelectValue :placeholder="t('settings.members.assign.placeholder')" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem
                            v-for="role in currentMember ? getAvailableRoles(currentMember) : []"
                            :key="role.id"
                            :value="role.id"
                        >
                            <div class="flex items-center gap-2">
                                <div class="h-3 w-3 shrink-0 rounded-full" :style="{ backgroundColor: role.color }" />
                                {{ role.name }}
                            </div>
                        </SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </DialogContent>
    </Dialog>

    <Dialog v-model:open="showRemoveRoleDialog">
        <DialogContent class="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>{{ t('settings.members.remove.title') }}</DialogTitle>
                <DialogDescription>
                    {{
                        t('settings.members.remove.description', {
                            role: removingRole?.name ?? '',
                            name: currentMember?.display_name ?? '',
                        })
                    }}
                </DialogDescription>
            </DialogHeader>

            <div
                v-if="actionError"
                class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
            >
                {{ actionError }}
            </div>

            <DialogFooter>
                <Button variant="outline" @click="showRemoveRoleDialog = false">{{
                    t('settings.common.cancel')
                }}</Button>
                <Button variant="destructive" :disabled="removingRoleLoading" @click="confirmRemoveRole">{{
                    t('settings.members.remove.submit')
                }}</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
