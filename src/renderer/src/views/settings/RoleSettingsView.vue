<!-- RoleSettingsView - Server role management -->

<script setup lang="ts">
import { useQuery, useMutation, useQueryCache } from '@pinia/colada';
import { Pencil, Plus, Shield, Trash2, Users } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { extractValidationErrors, getApiErrorMessage } from '@/api/errors';
import { createRole, updateRole, deleteRole } from '@/api/settings';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Separator } from '@/components/ui/separator';
import { SETTINGS_KEYS } from '@/queries/keys';
import { rolesQuery } from '@/queries/settings/roles';

const { t } = useI18n();

type Permission = { value: string; label: string };
type Role = {
    id: string;
    name: string;
    color: string;
    is_hoisted: boolean;
    position: number;
    permissions: string[];
    is_mentionable: boolean;
    is_default: boolean;
    users_count: number;
};

const queryCache = useQueryCache();
const { data: rawData, isLoading, error: queryError } = useQuery(rolesQuery);

const apiError = computed(() => {
    if (queryError.value) return getApiErrorMessage(queryError.value);
    return '';
});

const roles = computed<Role[]>(() => {
    if (!rawData.value?.data) return [];
    return rawData.value.data.map((res) => ({
        id: res.id,
        name: res.attributes.name,
        color: res.attributes.color,
        is_hoisted: res.attributes.is_hoisted ?? false,
        position: res.attributes.position,
        permissions: res.attributes.permissions ?? [],
        is_mentionable: res.attributes.is_mentionable ?? true,
        is_default: res.attributes.is_default ?? false,
        users_count: res.attributes.users_count ?? 0,
    }));
});

const permissions = computed<Permission[]>(() => {
    const metaPerms = rawData.value?.meta?.permissions;
    if (Array.isArray(metaPerms)) return metaPerms as unknown as Permission[];
    return [];
});

const showCreateDialog = ref(false);
const showEditDialog = ref(false);
const showDeleteDialog = ref(false);
const editingRole = ref<Role | null>(null);
const deletingRole = ref<Role | null>(null);

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

const permissionCategories = computed<{ label: string; permissions: string[] }[]>(() => [
    {
        label: t('settings.roles.form.categories.general'),
        permissions: ['manage_channels', 'manage_roles', 'manage_server', 'view_audit_log', 'manage_emojis'],
    },
    {
        label: t('settings.roles.form.categories.membership'),
        permissions: ['kick_members', 'ban_members', 'invite_members', 'change_nickname', 'manage_nicknames'],
    },
    {
        label: t('settings.roles.form.categories.text'),
        permissions: [
            'view_channels',
            'send_messages',
            'send_thread_messages',
            'create_threads',
            'embed_links',
            'attach_files',
            'add_reactions',
            'mention_everyone',
            'manage_messages',
            'manage_threads',
            'read_message_history',
            'pin_messages',
        ],
    },
    {
        label: t('settings.roles.form.categories.voice'),
        permissions: ['connect', 'speak', 'video', 'mute_members', 'deafen_members', 'move_members'],
    },
    { label: t('settings.roles.form.categories.admin'), permissions: ['administrator'] },
]);

function getPermissionLabel(value: string): string {
    return permissions.value.find((p) => p.value === value)?.label ?? value;
}

function getRolePermissions(role: Role): string[] {
    return role.permissions ?? [];
}

const { mutateAsync: doCreate, isLoading: processing } = useMutation({
    mutation: (data: typeof createForm.value) => createRole(data),
    onSuccess: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.roles() }),
});

const { mutateAsync: doUpdate } = useMutation({
    mutation: (params: { id: string; data: typeof editForm.value }) => updateRole(params.id, params.data),
    onSuccess: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.roles() }),
});

const { mutateAsync: doDelete } = useMutation({
    mutation: (id: string) => deleteRole(id),
    onSuccess: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.roles() }),
});

function openCreateDialog() {
    createForm.value = {
        name: '',
        color: '#99AAB5',
        is_hoisted: false,
        position: 1,
        permissions: [],
        is_mentionable: true,
    };
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
    createErrors.value = {};
    try {
        await doCreate(createForm.value);
        showCreateDialog.value = false;
    } catch (err: unknown) {
        const validation = extractValidationErrors(err);
        if (Object.keys(validation).length > 0) {
            createErrors.value = validation;
        } else {
            createErrors.value = { _general: getApiErrorMessage(err) };
        }
    }
}

async function submitEdit() {
    if (!editingRole.value) return;
    editErrors.value = {};
    try {
        await doUpdate({ id: editingRole.value.id, data: editForm.value });
        showEditDialog.value = false;
        editingRole.value = null;
    } catch (err: unknown) {
        const validation = extractValidationErrors(err);
        if (Object.keys(validation).length > 0) {
            editErrors.value = validation;
        } else {
            editErrors.value = { _general: getApiErrorMessage(err) };
        }
    }
}

async function confirmDelete() {
    if (!deletingRole.value) return;
    try {
        await doDelete(deletingRole.value.id);
        showDeleteDialog.value = false;
        deletingRole.value = null;
    } catch {
        showDeleteDialog.value = false;
    }
}
</script>

<template>
    <div>
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 flex items-center justify-between border-b px-6 py-4">
                <div>
                    <h2 class="text-lg font-semibold">{{ t('settings.roles.title') }}</h2>
                    <p class="text-muted-foreground mt-1 text-sm">
                        {{ t('settings.roles.description') }}
                    </p>
                </div>
                <Button @click="openCreateDialog" size="sm">
                    <Plus class="mr-1.5 h-4 w-4" />
                    {{ t('settings.roles.createRole') }}
                </Button>
            </div>

            <div class="p-6">
                <!-- Error banner -->
                <div
                    v-if="apiError"
                    class="border-destructive/50 bg-destructive/10 text-destructive mb-4 rounded-md border px-4 py-3 text-sm"
                >
                    {{ apiError }}
                </div>

                <div v-if="isLoading" class="text-muted-foreground text-sm">{{ t('settings.roles.loading') }}</div>

                <div
                    v-else-if="roles.length === 0 && !apiError"
                    class="flex flex-col items-center justify-center py-8 text-center"
                >
                    <div class="border-border bg-muted mb-3 rounded-full border p-3">
                        <Shield class="text-muted-foreground h-6 w-6" />
                    </div>
                    <p class="text-sm font-medium">{{ t('settings.roles.emptyTitle') }}</p>
                    <p class="text-muted-foreground mt-1 text-sm">{{ t('settings.roles.emptyDescription') }}</p>
                </div>

                <div v-else class="space-y-3">
                    <div
                        v-for="role in roles"
                        :key="role.id"
                        class="border-border bg-background flex items-center justify-between gap-4 rounded-lg border p-4"
                    >
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-3">
                                <div class="h-4 w-4 shrink-0 rounded-full" :style="{ backgroundColor: role.color }" />
                                <span class="font-medium">{{ role.name }}</span>
                                <Badge v-if="role.is_default" variant="secondary">{{
                                    t('settings.roles.defaultBadge')
                                }}</Badge>
                                <Badge
                                    v-if="getRolePermissions(role).includes('administrator')"
                                    variant="destructive"
                                    >{{ t('settings.roles.adminBadge') }}</Badge
                                >
                            </div>
                            <div class="text-muted-foreground mt-1 flex items-center gap-3 text-xs">
                                <span class="flex items-center gap-1">
                                    <Users class="h-3 w-3" />
                                    {{ t('settings.roles.memberCount', { n: role.users_count }, role.users_count) }}
                                </span>
                                <span>{{ t('settings.roles.position', { n: role.position }) }}</span>
                                <span>{{
                                    t('settings.roles.permissionsCount', { n: getRolePermissions(role).length })
                                }}</span>
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
                                class="text-destructive hover:text-destructive h-8 w-8"
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
                    <DialogTitle>{{ t('settings.roles.create.title') }}</DialogTitle>
                    <DialogDescription>{{ t('settings.roles.create.description') }}</DialogDescription>
                </DialogHeader>

                <form @submit.prevent="submitCreate" class="space-y-5">
                    <div class="grid gap-2">
                        <Label for="create-name">{{ t('settings.roles.form.name') }}</Label>
                        <Input
                            id="create-name"
                            v-model="createForm.name"
                            :placeholder="t('settings.roles.form.namePlaceholder')"
                        />
                        <p v-if="createErrors.name" class="text-destructive text-sm">{{ createErrors.name }}</p>
                    </div>

                    <div
                        v-if="createErrors._general"
                        class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
                    >
                        {{ createErrors._general }}
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div class="grid gap-2">
                            <Label for="create-color">{{ t('settings.roles.form.color') }}</Label>
                            <div class="flex items-center gap-2">
                                <input
                                    id="create-color"
                                    type="color"
                                    v-model="createForm.color"
                                    class="border-input h-9 w-12 cursor-pointer rounded border"
                                />
                                <Input v-model="createForm.color" class="font-mono text-xs" maxlength="7" />
                            </div>
                        </div>
                        <div class="grid gap-2">
                            <Label for="create-position">{{ t('settings.roles.form.position') }}</Label>
                            <Input id="create-position" type="number" v-model.number="createForm.position" min="-1" />
                        </div>
                    </div>

                    <div class="flex items-center gap-4">
                        <div class="flex items-center gap-2">
                            <Checkbox
                                id="create-hoisted"
                                :model-value="createForm.is_hoisted"
                                @update:model-value="createForm.is_hoisted = !!$event"
                            />
                            <Label for="create-hoisted" class="text-sm">{{
                                t('settings.roles.form.displaySeparately')
                            }}</Label>
                        </div>
                        <div class="flex items-center gap-2">
                            <Checkbox
                                id="create-mentionable"
                                :model-value="createForm.is_mentionable"
                                @update:model-value="createForm.is_mentionable = !!$event"
                            />
                            <Label for="create-mentionable" class="text-sm">{{
                                t('settings.roles.form.mentionable')
                            }}</Label>
                        </div>
                    </div>

                    <Separator />

                    <div>
                        <h3 class="mb-3 text-sm font-semibold">{{ t('settings.roles.form.permissions') }}</h3>
                        <div class="space-y-4">
                            <div v-for="category in permissionCategories" :key="category.label">
                                <p class="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
                                    {{ category.label }}
                                </p>
                                <div class="space-y-2">
                                    <div
                                        v-for="perm in category.permissions"
                                        :key="perm"
                                        class="flex items-center gap-2"
                                    >
                                        <Checkbox
                                            :id="`create-perm-${perm}`"
                                            :model-value="createForm.permissions.includes(perm)"
                                            @update:model-value="togglePermission(createForm, perm)"
                                        />
                                        <Label :for="`create-perm-${perm}`" class="text-sm">{{
                                            getPermissionLabel(perm)
                                        }}</Label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" @click="showCreateDialog = false">{{
                            t('settings.common.cancel')
                        }}</Button>
                        <Button type="submit" :disabled="processing">{{ t('settings.roles.create.submit') }}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>

        <!-- Edit Role Dialog -->
        <Dialog v-model:open="showEditDialog">
            <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{{ t('settings.roles.edit.title') }}</DialogTitle>
                    <DialogDescription>{{ t('settings.roles.edit.description') }}</DialogDescription>
                </DialogHeader>

                <form @submit.prevent="submitEdit" class="space-y-5">
                    <div class="grid gap-2">
                        <Label for="edit-name">{{ t('settings.roles.form.name') }}</Label>
                        <Input
                            id="edit-name"
                            v-model="editForm.name"
                            :placeholder="t('settings.roles.form.namePlaceholder')"
                        />
                        <p v-if="editErrors.name" class="text-destructive text-sm">{{ editErrors.name }}</p>
                    </div>

                    <div
                        v-if="editErrors._general"
                        class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
                    >
                        {{ editErrors._general }}
                    </div>

                    <div class="grid grid-cols-2 gap-4">
                        <div class="grid gap-2">
                            <Label for="edit-color">{{ t('settings.roles.form.color') }}</Label>
                            <div class="flex items-center gap-2">
                                <input
                                    id="edit-color"
                                    type="color"
                                    v-model="editForm.color"
                                    class="border-input h-9 w-12 cursor-pointer rounded border"
                                />
                                <Input v-model="editForm.color" class="font-mono text-xs" maxlength="7" />
                            </div>
                        </div>
                        <div class="grid gap-2">
                            <Label for="edit-position">{{ t('settings.roles.form.position') }}</Label>
                            <Input id="edit-position" type="number" v-model.number="editForm.position" min="-1" />
                        </div>
                    </div>

                    <div class="flex items-center gap-4">
                        <div class="flex items-center gap-2">
                            <Checkbox
                                id="edit-hoisted"
                                :model-value="editForm.is_hoisted"
                                @update:model-value="editForm.is_hoisted = !!$event"
                            />
                            <Label for="edit-hoisted" class="text-sm">{{
                                t('settings.roles.form.displaySeparately')
                            }}</Label>
                        </div>
                        <div class="flex items-center gap-2">
                            <Checkbox
                                id="edit-mentionable"
                                :model-value="editForm.is_mentionable"
                                @update:model-value="editForm.is_mentionable = !!$event"
                            />
                            <Label for="edit-mentionable" class="text-sm">{{
                                t('settings.roles.form.mentionable')
                            }}</Label>
                        </div>
                    </div>

                    <Separator />

                    <div>
                        <h3 class="mb-3 text-sm font-semibold">{{ t('settings.roles.form.permissions') }}</h3>
                        <div class="space-y-4">
                            <div v-for="category in permissionCategories" :key="category.label">
                                <p class="text-muted-foreground mb-2 text-xs font-medium tracking-wider uppercase">
                                    {{ category.label }}
                                </p>
                                <div class="space-y-2">
                                    <div
                                        v-for="perm in category.permissions"
                                        :key="perm"
                                        class="flex items-center gap-2"
                                    >
                                        <Checkbox
                                            :id="`edit-perm-${perm}`"
                                            :model-value="editForm.permissions.includes(perm)"
                                            @update:model-value="togglePermission(editForm, perm)"
                                        />
                                        <Label :for="`edit-perm-${perm}`" class="text-sm">{{
                                            getPermissionLabel(perm)
                                        }}</Label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" @click="showEditDialog = false">{{
                            t('settings.common.cancel')
                        }}</Button>
                        <Button type="submit" :disabled="processing">{{ t('settings.roles.edit.submit') }}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>

        <!-- Delete Role Dialog -->
        <Dialog v-model:open="showDeleteDialog">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{{ t('settings.roles.delete.title') }}</DialogTitle>
                    <DialogDescription>
                        {{ t('settings.roles.delete.description', { name: deletingRole?.name ?? '' }) }}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" @click="showDeleteDialog = false">{{
                        t('settings.common.cancel')
                    }}</Button>
                    <Button variant="destructive" @click="confirmDelete" :disabled="processing">{{
                        t('settings.roles.delete.submit')
                    }}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>
