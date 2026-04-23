<!-- MemberSettingsView - Server member management -->

<script setup lang="ts">
import { useQuery, useMutation, useQueryCache } from '@pinia/colada';
import { Search, Shield, UsersRound, X } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getApiErrorMessage } from '@/api/errors';
import { updateMemberRole, removeMemberRole } from '@/api/settings';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SETTINGS_KEYS } from '@/queries/keys';
import { settingsMembersQuery } from '@/queries/settings/members';

const { t } = useI18n();

type Role = {
    id: string;
    name: string;
    color: string;
    position: number;
    is_default: boolean;
};

type MemberRole = {
    id: string;
    name: string;
    color: string;
    position: number;
};

type Member = {
    id: string;
    name: string;
    username: string;
    email: string;
    avatar_urls: { thumb: string; small: string; medium: string } | null;
    display_name: string;
    roles: MemberRole[];
};

const queryCache = useQueryCache();
const { data: rawData, isLoading, error: queryError } = useQuery(settingsMembersQuery);
const searchQuery = ref('');

const apiError = computed(() => {
    if (queryError.value) return getApiErrorMessage(queryError.value);
    return '';
});

const allRoles = computed<Role[]>(() => {
    const metaRoles = rawData.value?.meta?.roles;
    if (!Array.isArray(metaRoles)) return [];
    return metaRoles.map((r: any) => ({
        id: String(r.id),
        name: r.attributes?.name ?? r.name ?? '',
        color: r.attributes?.color ?? r.color ?? '#99AAB5',
        position: r.attributes?.position ?? r.position ?? 0,
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
            .map((r) => ({
                id: r!.id,
                name: r!.attributes.name,
                color: r!.attributes.color,
                position: r!.attributes.position,
            }));
        return {
            id: res.id,
            name: res.attributes.name ?? '',
            username: res.attributes.username,
            email: res.attributes.email ?? '',
            avatar_urls: res.attributes.avatar_urls ?? null,
            display_name: res.attributes.display_name ?? res.attributes.name ?? res.attributes.username,
            roles,
        };
    });
});

const filteredMembers = computed(() => {
    if (!searchQuery.value) return members.value;
    const q = searchQuery.value.toLowerCase();
    return members.value.filter(
        (m) =>
            m.username.toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q) ||
            m.email.toLowerCase().includes(q),
    );
});

const showRoleDialog = ref(false);
const showRemoveRoleDialog = ref(false);
const selectedMember = ref<Member | null>(null);
const removingRole = ref<MemberRole | null>(null);
const roleError = ref('');

const { mutateAsync: doAssignRole, isLoading: processing } = useMutation({
    mutation: (params: { memberId: string; roleId: string }) => updateMemberRole(params.memberId, params.roleId),
    onSuccess: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.members() }),
});

const { mutateAsync: doRemoveRole } = useMutation({
    mutation: (params: { memberId: string; roleId: string }) => removeMemberRole(params.memberId, params.roleId),
    onSuccess: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.members() }),
});

function openAssignRoleDialog(member: Member) {
    selectedMember.value = member;
    roleError.value = '';
    showRoleDialog.value = true;
}

function openRemoveRoleDialog(member: Member, role: MemberRole) {
    selectedMember.value = member;
    removingRole.value = role;
    roleError.value = '';
    showRemoveRoleDialog.value = true;
}

async function doAssignRoleAction(roleId: string) {
    if (!selectedMember.value) return;
    roleError.value = '';
    try {
        await doAssignRole({ memberId: selectedMember.value.id, roleId });
        showRoleDialog.value = false;
        selectedMember.value = null;
    } catch (err: unknown) {
        roleError.value = getApiErrorMessage(err);
    }
}

async function confirmRemoveRole() {
    if (!selectedMember.value || !removingRole.value) return;
    roleError.value = '';
    try {
        await doRemoveRole({ memberId: selectedMember.value.id, roleId: removingRole.value.id });
        showRemoveRoleDialog.value = false;
        selectedMember.value = null;
        removingRole.value = null;
    } catch (err: unknown) {
        roleError.value = getApiErrorMessage(err);
    }
}

function getAvailableRoles(member: Member): Role[] {
    const memberRoleIds = new Set(member.roles.map((r) => r.id));
    return allRoles.value.filter((r) => !memberRoleIds.has(r.id) && !r.is_default);
}

function isDefaultRole(role: MemberRole): boolean {
    const matchedRole = allRoles.value.find((r) => r.id === role.id);
    return matchedRole?.is_default ?? role.name === 'everyone';
}
</script>

<template>
    <div>
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <div>
                    <h2 class="text-lg font-semibold">{{ t('settings.members.title') }}</h2>
                    <p class="text-muted-foreground mt-1 text-sm">
                        {{ t('settings.members.description') }}
                    </p>
                </div>
            </div>

            <div class="p-6">
                <div
                    v-if="apiError"
                    class="border-destructive/50 bg-destructive/10 text-destructive mb-4 rounded-md border px-4 py-3 text-sm"
                >
                    {{ apiError }}
                </div>

                <div v-if="isLoading" class="text-muted-foreground text-sm">
                    {{ t('settings.members.loading') }}
                </div>

                <template v-else>
                    <div class="relative mb-4">
                        <Search class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                        <Input
                            v-model="searchQuery"
                            :placeholder="t('settings.members.searchPlaceholder')"
                            class="pl-9"
                        />
                    </div>

                    <div
                        v-if="filteredMembers.length === 0"
                        class="flex flex-col items-center justify-center py-8 text-center"
                    >
                        <div class="border-border bg-muted mb-3 rounded-full border p-3">
                            <UsersRound class="text-muted-foreground h-6 w-6" />
                        </div>
                        <p class="text-sm font-medium">{{ t('settings.members.emptyTitle') }}</p>
                        <p class="text-muted-foreground mt-1 text-sm">
                            {{ searchQuery ? t('settings.members.emptyTrySearch') : t('settings.members.emptyNone') }}
                        </p>
                    </div>

                    <div v-else class="space-y-2">
                        <div
                            v-for="member in filteredMembers"
                            :key="member.id"
                            class="border-border bg-background flex items-center justify-between gap-4 rounded-lg border p-4"
                        >
                            <div class="min-w-0 flex-1">
                                <div class="flex items-center gap-3">
                                    <div
                                        class="bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-medium"
                                    >
                                        {{ member.display_name.charAt(0).toUpperCase() }}
                                    </div>
                                    <div class="min-w-0">
                                        <div class="flex items-center gap-2">
                                            <span class="truncate text-sm font-medium">{{ member.display_name }}</span>
                                            <span class="text-muted-foreground text-xs">@{{ member.username }}</span>
                                        </div>
                                        <div class="mt-1 flex flex-wrap gap-1">
                                            <Badge
                                                v-for="role in member.roles"
                                                :key="role.id"
                                                variant="outline"
                                                :class="[
                                                    'gap-1 text-xs',
                                                    isDefaultRole(role) ? '' : 'hover:bg-destructive/10 cursor-pointer',
                                                ]"
                                                @click="!isDefaultRole(role) && openRemoveRoleDialog(member, role)"
                                            >
                                                <div
                                                    class="h-2 w-2 rounded-full"
                                                    :style="{ backgroundColor: role.color }"
                                                />
                                                {{ role.name }}
                                                <X v-if="!isDefaultRole(role)" class="h-3 w-3" />
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <Button variant="outline" size="sm" @click="openAssignRoleDialog(member)">
                                <Shield class="mr-1.5 h-3.5 w-3.5" />
                                {{ t('settings.members.addRole') }}
                            </Button>
                        </div>
                    </div>
                </template>
            </div>
        </div>

        <Dialog v-model:open="showRoleDialog">
            <DialogContent class="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>{{ t('settings.members.assign.title') }}</DialogTitle>
                    <DialogDescription>
                        {{
                            t('settings.members.assign.description', {
                                name: selectedMember?.display_name ?? '',
                            })
                        }}
                    </DialogDescription>
                </DialogHeader>

                <div
                    v-if="roleError"
                    class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
                >
                    {{ roleError }}
                </div>

                <div class="space-y-2">
                    <div
                        v-if="selectedMember && getAvailableRoles(selectedMember).length === 0"
                        class="text-muted-foreground py-4 text-center text-sm"
                    >
                        {{ t('settings.members.assign.allAssigned') }}
                    </div>
                    <Select
                        v-else
                        :disabled="processing"
                        @update:model-value="(val) => typeof val === 'string' && doAssignRoleAction(val)"
                    >
                        <SelectTrigger>
                            <SelectValue :placeholder="t('settings.members.assign.placeholder')" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem
                                v-for="role in selectedMember ? getAvailableRoles(selectedMember) : []"
                                :key="role.id"
                                :value="role.id"
                            >
                                <div class="flex items-center gap-2">
                                    <div
                                        class="h-3 w-3 shrink-0 rounded-full"
                                        :style="{ backgroundColor: role.color }"
                                    />
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
                                name: selectedMember?.display_name ?? '',
                            })
                        }}
                    </DialogDescription>
                </DialogHeader>

                <div
                    v-if="roleError"
                    class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
                >
                    {{ roleError }}
                </div>

                <DialogFooter>
                    <Button variant="outline" @click="showRemoveRoleDialog = false">{{
                        t('settings.common.cancel')
                    }}</Button>
                    <Button variant="destructive" @click="confirmRemoveRole" :disabled="processing">{{
                        t('settings.members.remove.submit')
                    }}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
