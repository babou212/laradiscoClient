<!-- RoleSettingsView - Server role management -->

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Pencil, Plus, Shield, Trash2, Users } from 'lucide-vue-next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import api from '@/lib/api';

type Permission = { value: string; label: string };
type Role = {
    id: number;
    name: string;
    color: string;
    is_hoisted: boolean;
    position: number;
    permissions: string[];
    is_mentionable: boolean;
    is_default: boolean;
    users_count: number;
};

const roles = ref<Role[]>([]);
const permissions = ref<Permission[]>([]);
const isLoading = ref(true);
const apiError = ref('');

const showCreateDialog = ref(false);
const showEditDialog = ref(false);
const showDeleteDialog = ref(false);
const editingRole = ref<Role | null>(null);
const deletingRole = ref<Role | null>(null);
const processing = ref(false);

const createForm = ref({
    name: '',
    color: '#99AAB5',
    is_hoisted: false,
    position: 1,
    permissions: [] as string[],
    is_mentionable: true,
});

const editForm = ref({
    name: '',
    color: '#99AAB5',
    is_hoisted: false,
    position: 1,
    permissions: [] as string[],
    is_mentionable: true,
});

const createErrors = ref<Record<string, string>>({});
const editErrors = ref<Record<string, string>>({});

const permissionCategories = [
    { label: 'General Server', permissions: ['manage_channels', 'manage_roles', 'manage_server', 'view_audit_log', 'manage_emojis'] },
    { label: 'Membership', permissions: ['kick_members', 'ban_members', 'invite_members', 'change_nickname', 'manage_nicknames'] },
    { label: 'Text Channels', permissions: ['view_channels', 'send_messages', 'send_thread_messages', 'create_threads', 'embed_links', 'attach_files', 'add_reactions', 'mention_everyone', 'manage_messages', 'manage_threads', 'read_message_history', 'pin_messages'] },
    { label: 'Voice Channels', permissions: ['connect', 'speak', 'video', 'mute_members', 'deafen_members', 'move_members'] },
    { label: 'Admin', permissions: ['administrator'] },
];

function getPermissionLabel(value: string): string {
    return permissions.value.find((p) => p.value === value)?.label ?? value;
}

function getRolePermissions(role: Role): string[] {
    return role.permissions ?? [];
}

function extractValidationErrors(err: any): Record<string, string> {
    const result: Record<string, string> = {};
    if (err.response?.status === 422) {
        const ve = err.response.data.errors ?? {};
        for (const [key, val] of Object.entries(ve)) {
            result[key] = Array.isArray(val) ? (val as string[])[0] : String(val);
        }
    }
    return result;
}

function getApiErrorMessage(err: any): string {
    if (err.response?.status === 403) {
        return err.response.data?.message ?? 'You do not have permission to manage roles.';
    }
    if (err.response?.status === 422) {
        return ''; // Validation errors are handled per-field
    }
    if (err.response?.data?.message) {
        return err.response.data.message;
    }
    return 'An unexpected error occurred. Please try again.';
}

onMounted(async () => {
    await loadRoles();
});

async function loadRoles() {
    isLoading.value = true;
    apiError.value = '';
    try {
        const response = await api.get('/settings/roles');
        roles.value = response.data.roles;
        permissions.value = response.data.permissions;
    } catch (err: any) {
        apiError.value = getApiErrorMessage(err);
    } finally {
        isLoading.value = false;
    }
}

function openCreateDialog() {
    createForm.value = { name: '', color: '#99AAB5', is_hoisted: false, position: 1, permissions: [], is_mentionable: true };
    createErrors.value = {};
    showCreateDialog.value = true;
}

function openEditDialog(role: Role) {
    editingRole.value = role;
    editForm.value = {
        name: role.name,
        color: role.color,
        is_hoisted: role.is_hoisted,
        position: role.position,
        permissions: [...getRolePermissions(role)],
        is_mentionable: role.is_mentionable,
    };
    editErrors.value = {};
    showEditDialog.value = true;
}

function openDeleteDialog(role: Role) {
    deletingRole.value = role;
    showDeleteDialog.value = true;
}

function togglePermission(form: { permissions: string[] }, permission: string) {
    const idx = form.permissions.indexOf(permission);
    if (idx === -1) {
        form.permissions.push(permission);
    } else {
        form.permissions.splice(idx, 1);
    }
}

async function submitCreate() {
    processing.value = true;
    createErrors.value = {};
    apiError.value = '';
    try {
        await api.post('/settings/roles', createForm.value);
        showCreateDialog.value = false;
        await loadRoles();
    } catch (err: any) {
        if (err.response?.status === 422) {
            createErrors.value = extractValidationErrors(err);
        } else {
            createErrors.value = { _general: getApiErrorMessage(err) };
        }
    } finally {
        processing.value = false;
    }
}

async function submitEdit() {
    if (!editingRole.value) return;
    processing.value = true;
    editErrors.value = {};
    apiError.value = '';
    try {
        await api.put(`/settings/roles/${editingRole.value.id}`, editForm.value);
        showEditDialog.value = false;
        editingRole.value = null;
        await loadRoles();
    } catch (err: any) {
        if (err.response?.status === 422) {
            editErrors.value = extractValidationErrors(err);
        } else {
            editErrors.value = { _general: getApiErrorMessage(err) };
        }
    } finally {
        processing.value = false;
    }
}

async function confirmDelete() {
    if (!deletingRole.value) return;
    processing.value = true;
    apiError.value = '';
    try {
        await api.delete(`/settings/roles/${deletingRole.value.id}`);
        showDeleteDialog.value = false;
        deletingRole.value = null;
        await loadRoles();
    } catch (err: any) {
        showDeleteDialog.value = false;
        apiError.value = getApiErrorMessage(err);
    } finally {
        processing.value = false;
    }
}
</script>

<template>
    <div>
        <div class="rounded-lg border bg-card">
            <div class="flex items-center justify-between border-b bg-muted/50 px-6 py-4">
                <div>
                    <h2 class="text-lg font-semibold">Roles</h2>
                    <p class="mt-1 text-sm text-muted-foreground">
                        Manage server roles and their permissions. Higher position roles outrank lower ones.
                    </p>
                </div>
                <Button @click="openCreateDialog" size="sm">
                    <Plus class="mr-1.5 h-4 w-4" />
                    Create Role
                </Button>
            </div>

            <div class="p-6">
                <!-- Error banner -->
                <div v-if="apiError" class="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {{ apiError }}
                </div>

                <div v-if="isLoading" class="text-sm text-muted-foreground">Loading...</div>

                <div v-else-if="roles.length === 0 && !apiError" class="flex flex-col items-center justify-center py-8 text-center">
                    <div class="mb-3 rounded-full border border-border bg-muted p-3">
                        <Shield class="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p class="text-sm font-medium">No roles yet</p>
                    <p class="mt-1 text-sm text-muted-foreground">Create a role to manage permissions.</p>
                </div>

                <div v-else class="space-y-3">
                    <div
                        v-for="role in roles"
                        :key="role.id"
                        class="flex items-center justify-between gap-4 rounded-lg border border-border bg-background p-4"
                    >
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-3">
                                <div class="h-4 w-4 shrink-0 rounded-full" :style="{ backgroundColor: role.color }" />
                                <span class="font-medium">{{ role.name }}</span>
                                <Badge v-if="role.is_default" variant="secondary">Default</Badge>
                                <Badge v-if="getRolePermissions(role).includes('administrator')" variant="destructive">Admin</Badge>
                            </div>
                            <div class="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                                <span class="flex items-center gap-1">
                                    <Users class="h-3 w-3" />
                                    {{ role.users_count }} {{ role.users_count === 1 ? 'member' : 'members' }}
                                </span>
                                <span>Position: {{ role.position }}</span>
                                <span>{{ getRolePermissions(role).length }} permissions</span>
                            </div>
                        </div>

                        <div class="flex shrink-0 items-center gap-2">
                            <Button variant="ghost" size="icon" @click="openEditDialog(role)" class="h-8 w-8">
                                <Pencil class="h-4 w-4" />
                            </Button>
                            <Button
                                v-if="!role.is_default"
                                variant="ghost"
                                size="icon"
                                @click="openDeleteDialog(role)"
                                class="h-8 w-8 text-destructive hover:text-destructive"
                            >
                                <Trash2 class="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Create Role Dialog -->
        <Dialog v-model:open="showCreateDialog">
            <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Create Role</DialogTitle>
                    <DialogDescription>Create a new role with specific permissions.</DialogDescription>
                </DialogHeader>

                <form @submit.prevent="submitCreate" class="space-y-5">
                    <div class="grid gap-2">
                        <Label for="create-name">Name</Label>
                        <Input id="create-name" v-model="createForm.name" placeholder="Role name" />
                        <p v-if="createErrors.name" class="text-sm text-destructive">{{ createErrors.name }}</p>
                    </div>

                    <div v-if="createErrors._general" class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {{ createErrors._general }}
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div class="grid gap-2">
                            <Label for="create-color">Color</Label>
                            <div class="flex items-center gap-2">
                                <input id="create-color" type="color" v-model="createForm.color" class="h-9 w-12 cursor-pointer rounded border border-input" />
                                <Input v-model="createForm.color" class="font-mono text-xs" maxlength="7" />
                            </div>
                        </div>
                        <div class="grid gap-2">
                            <Label for="create-position">Position</Label>
                            <Input id="create-position" type="number" v-model.number="createForm.position" min="0" />
                        </div>
                    </div>

                    <div class="flex items-center gap-4">
                        <div class="flex items-center gap-2">
                            <Checkbox id="create-hoisted" :model-value="createForm.is_hoisted" @update:model-value="createForm.is_hoisted = !!$event" />
                            <Label for="create-hoisted" class="text-sm">Display separately</Label>
                        </div>
                        <div class="flex items-center gap-2">
                            <Checkbox id="create-mentionable" :model-value="createForm.is_mentionable" @update:model-value="createForm.is_mentionable = !!$event" />
                            <Label for="create-mentionable" class="text-sm">Mentionable</Label>
                        </div>
                    </div>

                    <Separator />

                    <div>
                        <h3 class="mb-3 text-sm font-semibold">Permissions</h3>
                        <div class="space-y-4">
                            <div v-for="category in permissionCategories" :key="category.label">
                                <p class="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">{{ category.label }}</p>
                                <div class="space-y-2">
                                    <div v-for="perm in category.permissions" :key="perm" class="flex items-center gap-2">
                                        <Checkbox :id="`create-perm-${perm}`" :model-value="createForm.permissions.includes(perm)" @update:model-value="togglePermission(createForm, perm)" />
                                        <Label :for="`create-perm-${perm}`" class="text-sm">{{ getPermissionLabel(perm) }}</Label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" @click="showCreateDialog = false">Cancel</Button>
                        <Button type="submit" :disabled="processing">Create Role</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>

        <!-- Edit Role Dialog -->
        <Dialog v-model:open="showEditDialog">
            <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Edit Role</DialogTitle>
                    <DialogDescription>Modify role settings and permissions.</DialogDescription>
                </DialogHeader>

                <form @submit.prevent="submitEdit" class="space-y-5">
                    <div class="grid gap-2">
                        <Label for="edit-name">Name</Label>
                        <Input id="edit-name" v-model="editForm.name" placeholder="Role name" />
                        <p v-if="editErrors.name" class="text-sm text-destructive">{{ editErrors.name }}</p>
                    </div>

                    <div v-if="editErrors._general" class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {{ editErrors._general }}
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div class="grid gap-2">
                            <Label for="edit-color">Color</Label>
                            <div class="flex items-center gap-2">
                                <input id="edit-color" type="color" v-model="editForm.color" class="h-9 w-12 cursor-pointer rounded border border-input" />
                                <Input v-model="editForm.color" class="font-mono text-xs" maxlength="7" />
                            </div>
                        </div>
                        <div class="grid gap-2">
                            <Label for="edit-position">Position</Label>
                            <Input id="edit-position" type="number" v-model.number="editForm.position" min="0" />
                        </div>
                    </div>

                    <div class="flex items-center gap-4">
                        <div class="flex items-center gap-2">
                            <Checkbox id="edit-hoisted" :model-value="editForm.is_hoisted" @update:model-value="editForm.is_hoisted = !!$event" />
                            <Label for="edit-hoisted" class="text-sm">Display separately</Label>
                        </div>
                        <div class="flex items-center gap-2">
                            <Checkbox id="edit-mentionable" :model-value="editForm.is_mentionable" @update:model-value="editForm.is_mentionable = !!$event" />
                            <Label for="edit-mentionable" class="text-sm">Mentionable</Label>
                        </div>
                    </div>

                    <Separator />

                    <div>
                        <h3 class="mb-3 text-sm font-semibold">Permissions</h3>
                        <div class="space-y-4">
                            <div v-for="category in permissionCategories" :key="category.label">
                                <p class="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">{{ category.label }}</p>
                                <div class="space-y-2">
                                    <div v-for="perm in category.permissions" :key="perm" class="flex items-center gap-2">
                                        <Checkbox :id="`edit-perm-${perm}`" :model-value="editForm.permissions.includes(perm)" @update:model-value="togglePermission(editForm, perm)" />
                                        <Label :for="`edit-perm-${perm}`" class="text-sm">{{ getPermissionLabel(perm) }}</Label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" @click="showEditDialog = false">Cancel</Button>
                        <Button type="submit" :disabled="processing">Save Changes</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>

        <!-- Delete Role Dialog -->
        <Dialog v-model:open="showDeleteDialog">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Delete Role</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to delete the role <strong>{{ deletingRole?.name }}</strong>? All users with this role will lose its permissions. This action cannot be undone.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" @click="showDeleteDialog = false">Cancel</Button>
                    <Button variant="destructive" @click="confirmDelete" :disabled="processing">Delete Role</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
