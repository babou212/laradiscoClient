<!-- MemberSettingsView - Server member management -->

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Search, Shield, UsersRound, X } from 'lucide-vue-next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import api from '@/lib/api';

type Role = {
    id: number;
    name: string;
    color: string;
    position: number;
    is_default: boolean;
};

type MemberRole = {
    id: number;
    name: string;
    color: string;
    position: number;
};

type Member = {
    id: number;
    name: string;
    username: string;
    email: string;
    avatar_path: string | null;
    display_name: string;
    roles: MemberRole[];
};

const members = ref<Member[]>([]);
const allRoles = ref<Role[]>([]);
const isLoading = ref(true);
const searchQuery = ref('');
const apiError = ref('');

const showRoleDialog = ref(false);
const showRemoveRoleDialog = ref(false);
const selectedMember = ref<Member | null>(null);
const removingRole = ref<MemberRole | null>(null);
const processing = ref(false);
const roleError = ref('');

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

function getApiErrorMessage(err: any): string {
    if (err.response?.status === 403) {
        return err.response.data?.message ?? 'You do not have permission to manage members.';
    }
    if (err.response?.data?.message) {
        return err.response.data.message;
    }
    return 'An unexpected error occurred. Please try again.';
}

onMounted(async () => {
    await loadMembers();
});

async function loadMembers() {
    isLoading.value = true;
    apiError.value = '';
    try {
        const response = await api.get('/settings/members');
        members.value = response.data.members;
        allRoles.value = response.data.roles;
    } catch (err: any) {
        apiError.value = getApiErrorMessage(err);
    } finally {
        isLoading.value = false;
    }
}

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

async function doAssignRole(roleId: number) {
    if (!selectedMember.value) return;
    processing.value = true;
    roleError.value = '';
    try {
        await api.post(`/settings/members/${selectedMember.value.id}/roles`, { role_id: roleId });
        showRoleDialog.value = false;
        selectedMember.value = null;
        await loadMembers();
    } catch (err: any) {
        roleError.value = getApiErrorMessage(err);
    } finally {
        processing.value = false;
    }
}

async function confirmRemoveRole() {
    if (!selectedMember.value || !removingRole.value) return;
    processing.value = true;
    roleError.value = '';
    try {
        await api.delete(`/settings/members/${selectedMember.value.id}/roles/${removingRole.value.id}`);
        showRemoveRoleDialog.value = false;
        selectedMember.value = null;
        removingRole.value = null;
        await loadMembers();
    } catch (err: any) {
        roleError.value = getApiErrorMessage(err);
    } finally {
        processing.value = false;
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
        <div class="rounded-lg border bg-card">
            <div class="border-b bg-muted/50 px-6 py-4">
                <div>
                    <h2 class="text-lg font-semibold">Members</h2>
                    <p class="mt-1 text-sm text-muted-foreground">
                        Manage member roles. Assign or remove roles to control permissions.
                    </p>
                </div>
            </div>

            <div class="p-6">
                <!-- Error banner -->
                <div v-if="apiError" class="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {{ apiError }}
                </div>

                <div v-if="isLoading" class="text-sm text-muted-foreground">Loading...</div>

                <template v-else>
                    <div class="relative mb-4">
                        <Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input v-model="searchQuery" placeholder="Search members..." class="pl-9" />
                    </div>

                    <div
                        v-if="filteredMembers.length === 0"
                        class="flex flex-col items-center justify-center py-8 text-center"
                    >
                        <div class="mb-3 rounded-full border border-border bg-muted p-3">
                            <UsersRound class="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p class="text-sm font-medium">No members found</p>
                        <p class="mt-1 text-sm text-muted-foreground">
                            {{ searchQuery ? 'Try a different search term.' : 'No members registered yet.' }}
                        </p>
                    </div>

                    <div v-else class="space-y-2">
                        <div
                            v-for="member in filteredMembers"
                            :key="member.id"
                            class="flex items-center justify-between gap-4 rounded-lg border border-border bg-background p-4"
                        >
                            <div class="min-w-0 flex-1">
                                <div class="flex items-center gap-3">
                                    <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                                        {{ member.display_name.charAt(0).toUpperCase() }}
                                    </div>
                                    <div class="min-w-0">
                                        <div class="flex items-center gap-2">
                                            <span class="truncate text-sm font-medium">{{ member.display_name }}</span>
                                            <span class="text-xs text-muted-foreground">@{{ member.username }}</span>
                                        </div>
                                        <div class="mt-1 flex flex-wrap gap-1">
                                            <Badge
                                                v-for="role in member.roles"
                                                :key="role.id"
                                                variant="outline"
                                                :class="[
                                                    'gap-1 text-xs',
                                                    isDefaultRole(role) ? '' : 'cursor-pointer hover:bg-destructive/10',
                                                ]"
                                                @click="!isDefaultRole(role) && openRemoveRoleDialog(member, role)"
                                            >
                                                <div class="h-2 w-2 rounded-full" :style="{ backgroundColor: role.color }" />
                                                {{ role.name }}
                                                <X v-if="!isDefaultRole(role)" class="h-3 w-3" />
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <Button variant="outline" size="sm" @click="openAssignRoleDialog(member)">
                                <Shield class="mr-1.5 h-3.5 w-3.5" />
                                Add Role
                            </Button>
                        </div>
                    </div>
                </template>
            </div>
        </div>

        <!-- Assign Role Dialog -->
        <Dialog v-model:open="showRoleDialog">
            <DialogContent class="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Assign Role</DialogTitle>
                    <DialogDescription>
                        Select a role to assign to <strong>{{ selectedMember?.display_name }}</strong>.
                    </DialogDescription>
                </DialogHeader>

                <!-- Error in dialog -->
                <div v-if="roleError" class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {{ roleError }}
                </div>

                <div class="space-y-2">
                    <div
                        v-if="selectedMember && getAvailableRoles(selectedMember).length === 0"
                        class="py-4 text-center text-sm text-muted-foreground"
                    >
                        This member already has all available roles.
                    </div>
                    <Button
                        v-for="role in selectedMember ? getAvailableRoles(selectedMember) : []"
                        :key="role.id"
                        variant="outline"
                        class="w-full justify-start gap-3"
                        @click="doAssignRole(role.id)"
                        :disabled="processing"
                    >
                        <div class="h-3 w-3 rounded-full" :style="{ backgroundColor: role.color }" />
                        {{ role.name }}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>

        <!-- Remove Role Dialog -->
        <Dialog v-model:open="showRemoveRoleDialog">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Remove Role</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to remove the role <strong>{{ removingRole?.name }}</strong> from <strong>{{ selectedMember?.display_name }}</strong>?
                    </DialogDescription>
                </DialogHeader>

                <!-- Error in dialog -->
                <div v-if="roleError" class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {{ roleError }}
                </div>

                <DialogFooter>
                    <Button variant="outline" @click="showRemoveRoleDialog = false">Cancel</Button>
                    <Button variant="destructive" @click="confirmRemoveRole" :disabled="processing">Remove Role</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
