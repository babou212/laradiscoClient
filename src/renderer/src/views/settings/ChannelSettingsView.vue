<script setup lang="ts">
import { useQuery, useMutation, useQueryCache } from '@pinia/colada';
import { ChevronDown, ChevronRight, Folder, Hash, Lock, Pencil, Plus, Shield, Trash2, Volume2 } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { extractValidationErrors } from '@/api/errors';
import {
    createSettingsChannel,
    updateSettingsChannel,
    deleteSettingsChannel,
    createSettingsCategory,
    updateSettingsCategory,
    deleteSettingsCategory,
    getChannelOverrides,
    createChannelOverride,
    deleteChannelOverride,
} from '@/api/settings';
import { findIncluded, relationshipIds } from '@/api/types';
import type { ChannelResource } from '@/api/types';
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
import { settingsChannelsQuery } from '@/queries/settings/channels';

type Permission = { value: string; label: string };
type Role = { id: string; name: string; color: string };

type Channel = {
    id: string;
    category_id: string | null;
    name: string;
    slug: string;
    topic: string | null;
    type: 'text' | 'voice';
    position: number;
    is_private: boolean;
    slowmode_seconds: number | null;
};

type Category = {
    id: string;
    name: string;
    position: number;
    channels: Channel[];
};

type ChannelOverride = {
    id: number;
    channel_id: number;
    role_id: number | null;
    user_id: number | null;
    allow: string[];
    deny: string[];
    role?: { id: number; name: string; color: string } | null;
    user?: { id: number; username: string; name: string } | null;
};

const queryCache = useQueryCache();
const { data: rawData, isLoading } = useQuery(settingsChannelsQuery);

const categories = computed<Category[]>(() => {
    if (!rawData.value?.data) return [];
    return rawData.value.data.map((catRes) => {
        const channelIds = relationshipIds(catRes.relationships?.channels);
        const channels: Channel[] = channelIds
            .map((cid) => findIncluded<ChannelResource>(rawData.value!.included, 'channels', cid))
            .filter(Boolean)
            .map((ch) => ({
                id: ch!.id,
                category_id: catRes.id,
                name: ch!.attributes.name,
                slug: ch!.attributes.name,
                topic: ch!.attributes.topic,
                type: (ch!.attributes.channel_type === 'voice' ? 'voice' : 'text') as 'text' | 'voice',
                position: ch!.attributes.position ?? 0,
                is_private: ch!.attributes.is_private ?? false,
                slowmode_seconds: null,
            }));
        return {
            id: catRes.id,
            name: catRes.attributes.name,
            position: catRes.attributes.position,
            channels,
        };
    });
});

const roles = computed<Role[]>(() => {
    const metaRoles = rawData.value?.meta?.roles;
    if (Array.isArray(metaRoles)) return metaRoles as Role[];
    return [];
});

const allPermissions = computed<Permission[]>(() => {
    const metaPerms = rawData.value?.meta?.permissions;
    if (Array.isArray(metaPerms)) return metaPerms as unknown as Permission[];
    return [];
});

const processing = ref(false);
const expandedCategories = ref<Set<string>>(new Set());

const showCreateChannelDialog = ref(false);
const showEditChannelDialog = ref(false);
const showDeleteChannelDialog = ref(false);
const showCreateCategoryDialog = ref(false);
const showEditCategoryDialog = ref(false);
const showDeleteCategoryDialog = ref(false);
const showOverridesDialog = ref(false);

const editingChannel = ref<Channel | null>(null);
const deletingChannel = ref<Channel | null>(null);
const editingCategory = ref<Category | null>(null);
const deletingCategory = ref<Category | null>(null);
const overridesChannel = ref<Channel | null>(null);
const channelOverrides = ref<ChannelOverride[]>([]);
const loadingOverrides = ref(false);

const channelForm = ref({
    category_id: null as string | null,
    name: '',
    topic: '',
    type: 'text' as 'text' | 'voice',
    position: 0,
    is_private: false,
    slowmode_seconds: 0,
});

const editChannelForm = ref({
    category_id: null as string | null,
    name: '',
    topic: '',
    type: 'text' as 'text' | 'voice',
    position: 0,
    is_private: false,
    slowmode_seconds: 0,
});

const categoryForm = ref({ name: '' });
const editCategoryForm = ref({ name: '' });

const overrideForm = ref({
    role_id: null as string | null,
    allow: [] as string[],
    deny: [] as string[],
});

const channelErrors = ref<Record<string, string>>({});
const editChannelErrors = ref<Record<string, string>>({});
const categoryErrors = ref<Record<string, string>>({});
const editCategoryErrors = ref<Record<string, string>>({});

const channelPermissions = [
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
    'connect',
    'speak',
    'video',
];

const availableOverrideRoles = computed(() => {
    const existingRoleIds = new Set(channelOverrides.value.filter((o) => o.role_id).map((o) => o.role_id));
    return roles.value.filter((r) => !existingRoleIds.has(Number(r.id)));
});

function channelIcon(type: string) {
    return type === 'voice' ? Volume2 : Hash;
}

function getPermissionLabel(value: string): string {
    return allPermissions.value.find((p) => p.value === value)?.label ?? value;
}

function toggleCategory(id: string) {
    if (expandedCategories.value.has(id)) {
        expandedCategories.value.delete(id);
    } else {
        expandedCategories.value.add(id);
    }
}

// Expand all categories when data loads
watch(
    categories,
    (cats) => {
        if (cats.length > 0) {
            expandedCategories.value = new Set(cats.map((c) => c.id));
        }
    },
    { immediate: true },
);

const { mutateAsync: doCreateChannel } = useMutation({
    mutation: (data: typeof channelForm.value) =>
        createSettingsChannel({
            name: data.name,
            category_id: data.category_id ?? '',
            channel_type: data.type,
            topic: data.topic || undefined,
            is_private: data.is_private,
        }),
    onSuccess: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.channels() }),
});

const { mutateAsync: doEditChannel } = useMutation({
    mutation: (params: { id: string; data: typeof editChannelForm.value }) =>
        updateSettingsChannel(params.id, {
            name: params.data.name,
            topic: params.data.topic || undefined,
            is_private: params.data.is_private,
            position: params.data.position,
        }),
    onSuccess: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.channels() }),
});

const { mutateAsync: doDeleteChannel } = useMutation({
    mutation: (id: string) => deleteSettingsChannel(id),
    onSuccess: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.channels() }),
});

const { mutateAsync: doCreateCategory } = useMutation({
    mutation: (data: { name: string }) => createSettingsCategory(data),
    onSuccess: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.channels() }),
});

const { mutateAsync: doEditCategory } = useMutation({
    mutation: (params: { id: string; data: { name: string } }) => updateSettingsCategory(params.id, params.data),
    onSuccess: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.channels() }),
});

const { mutateAsync: doDeleteCategory } = useMutation({
    mutation: (id: string) => deleteSettingsCategory(id),
    onSuccess: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.channels() }),
});

function openCreateChannel(categoryId: string | null = null) {
    channelForm.value = {
        category_id: categoryId,
        name: '',
        topic: '',
        type: 'text',
        position: 0,
        is_private: false,
        slowmode_seconds: 0,
    };
    channelErrors.value = {};
    showCreateChannelDialog.value = true;
}

function openEditChannel(channel: Channel) {
    editingChannel.value = channel;
    editChannelForm.value = {
        category_id: channel.category_id,
        name: channel.name,
        topic: channel.topic ?? '',
        type: channel.type,
        position: channel.position,
        is_private: channel.is_private,
        slowmode_seconds: channel.slowmode_seconds ?? 0,
    };
    editChannelErrors.value = {};
    showEditChannelDialog.value = true;
}

function openDeleteChannel(channel: Channel) {
    deletingChannel.value = channel;
    showDeleteChannelDialog.value = true;
}

async function submitCreateChannel() {
    processing.value = true;
    channelErrors.value = {};
    try {
        await doCreateChannel(channelForm.value);
        showCreateChannelDialog.value = false;
    } catch (err: unknown) {
        channelErrors.value = extractValidationErrors(err);
    } finally {
        processing.value = false;
    }
}

async function submitEditChannel() {
    if (!editingChannel.value) return;
    processing.value = true;
    editChannelErrors.value = {};
    try {
        await doEditChannel({ id: editingChannel.value.id, data: editChannelForm.value });
        showEditChannelDialog.value = false;
        editingChannel.value = null;
    } catch (err: unknown) {
        editChannelErrors.value = extractValidationErrors(err);
    } finally {
        processing.value = false;
    }
}

async function confirmDeleteChannel() {
    if (!deletingChannel.value) return;
    processing.value = true;
    try {
        await doDeleteChannel(deletingChannel.value.id);
        showDeleteChannelDialog.value = false;
        deletingChannel.value = null;
    } catch {
        // handle
    } finally {
        processing.value = false;
    }
}

function openCreateCategory() {
    categoryForm.value = { name: '' };
    categoryErrors.value = {};
    showCreateCategoryDialog.value = true;
}

function openEditCategory(category: Category) {
    editingCategory.value = category;
    editCategoryForm.value = { name: category.name };
    editCategoryErrors.value = {};
    showEditCategoryDialog.value = true;
}

function openDeleteCategory(category: Category) {
    deletingCategory.value = category;
    showDeleteCategoryDialog.value = true;
}

async function submitCreateCategory() {
    processing.value = true;
    categoryErrors.value = {};
    try {
        await doCreateCategory(categoryForm.value);
        showCreateCategoryDialog.value = false;
    } catch (err: unknown) {
        categoryErrors.value = extractValidationErrors(err);
    } finally {
        processing.value = false;
    }
}

async function submitEditCategory() {
    if (!editingCategory.value) return;
    processing.value = true;
    editCategoryErrors.value = {};
    try {
        await doEditCategory({ id: editingCategory.value.id, data: editCategoryForm.value });
        showEditCategoryDialog.value = false;
        editingCategory.value = null;
    } catch (err: unknown) {
        editCategoryErrors.value = extractValidationErrors(err);
    } finally {
        processing.value = false;
    }
}

async function confirmDeleteCategory() {
    if (!deletingCategory.value) return;
    processing.value = true;
    try {
        await doDeleteCategory(deletingCategory.value.id);
        showDeleteCategoryDialog.value = false;
        deletingCategory.value = null;
    } catch {
        // handle
    } finally {
        processing.value = false;
    }
}

async function openOverrides(channel: Channel) {
    overridesChannel.value = channel;
    loadingOverrides.value = true;
    showOverridesDialog.value = true;
    overrideForm.value = { role_id: null, allow: [], deny: [] };

    try {
        const data = await getChannelOverrides(channel.id);
        channelOverrides.value = data as ChannelOverride[];
    } catch {
        channelOverrides.value = [];
    } finally {
        loadingOverrides.value = false;
    }
}

async function submitOverride() {
    if (!overridesChannel.value) return;
    processing.value = true;
    try {
        await createChannelOverride(overridesChannel.value.id, overrideForm.value);
        overrideForm.value = { role_id: null, allow: [], deny: [] };

        if (overridesChannel.value) {
            const data = await getChannelOverrides(overridesChannel.value.id);
            channelOverrides.value = data as ChannelOverride[];
        }
    } catch {
        // handle
    } finally {
        processing.value = false;
    }
}

async function deleteOverrideAction(override: ChannelOverride) {
    if (!overridesChannel.value) return;
    processing.value = true;
    try {
        await deleteChannelOverride(overridesChannel.value.id, String(override.id));

        if (overridesChannel.value) {
            const data = await getChannelOverrides(overridesChannel.value.id);
            channelOverrides.value = data as ChannelOverride[];
        }
    } catch {
        // handle
    } finally {
        processing.value = false;
    }
}

function toggleOverridePermission(list: 'allow' | 'deny', permission: string) {
    const otherList = list === 'allow' ? 'deny' : 'allow';

    const otherIdx = overrideForm.value[otherList].indexOf(permission);
    if (otherIdx !== -1) {
        overrideForm.value[otherList].splice(otherIdx, 1);
    }
    const idx = overrideForm.value[list].indexOf(permission);
    if (idx === -1) {
        overrideForm.value[list].push(permission);
    } else {
        overrideForm.value[list].splice(idx, 1);
    }
}
</script>

<template>
    <div>
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 flex items-center justify-between border-b px-6 py-4">
                <div>
                    <h2 class="text-lg font-semibold">Channels</h2>
                    <p class="text-muted-foreground mt-1 text-sm">
                        Manage categories, channels, and per-channel permission overrides.
                    </p>
                </div>
                <div class="flex gap-2">
                    <Button @click="openCreateCategory" size="sm" variant="outline">
                        <Folder class="mr-1.5 h-4 w-4" />
                        New Category
                    </Button>
                    <Button @click="openCreateChannel()" size="sm">
                        <Plus class="mr-1.5 h-4 w-4" />
                        New Channel
                    </Button>
                </div>
            </div>

            <div class="p-6">
                <!-- Loading -->
                <div v-if="isLoading" class="flex items-center justify-center py-8">
                    <div class="text-muted-foreground text-sm">Loading channels...</div>
                </div>

                <!-- Empty -->
                <div
                    v-else-if="categories.length === 0"
                    class="flex flex-col items-center justify-center py-8 text-center"
                >
                    <div class="border-border bg-muted mb-3 rounded-full border p-3">
                        <Hash class="text-muted-foreground h-6 w-6" />
                    </div>
                    <p class="text-sm font-medium">No channels yet</p>
                    <p class="text-muted-foreground mt-1 text-sm">Create a category and add channels to get started.</p>
                </div>

                <!-- Category list -->
                <div v-else class="space-y-4">
                    <div v-for="category in categories" :key="category.id" class="border-border rounded-lg border">
                        <!-- Category Header -->
                        <div
                            class="bg-muted/30 flex cursor-pointer items-center justify-between px-4 py-3"
                            @click="toggleCategory(category.id)"
                        >
                            <div class="flex items-center gap-2">
                                <component
                                    :is="expandedCategories.has(category.id) ? ChevronDown : ChevronRight"
                                    class="text-muted-foreground h-4 w-4"
                                />
                                <span class="text-sm font-semibold tracking-wider uppercase">
                                    {{ category.name }}
                                </span>
                                <span class="text-muted-foreground text-xs"> ({{ category.channels.length }}) </span>
                            </div>
                            <div class="flex items-center gap-1" @click.stop>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="h-7 w-7"
                                    @click="openCreateChannel(category.id)"
                                >
                                    <Plus class="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" class="h-7 w-7" @click="openEditCategory(category)">
                                    <Pencil class="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="text-destructive hover:text-destructive h-7 w-7"
                                    @click="openDeleteCategory(category)"
                                >
                                    <Trash2 class="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>

                        <!-- Channels -->
                        <div v-show="expandedCategories.has(category.id)" class="divide-y">
                            <div
                                v-for="channel in category.channels"
                                :key="channel.id"
                                class="flex items-center justify-between px-4 py-3"
                            >
                                <div class="flex items-center gap-3">
                                    <component :is="channelIcon(channel.type)" class="text-muted-foreground h-4 w-4" />
                                    <div>
                                        <div class="flex items-center gap-2">
                                            <span class="text-sm font-medium">{{ channel.name }}</span>
                                            <Lock v-if="channel.is_private" class="text-muted-foreground h-3 w-3" />
                                            <Badge v-if="channel.is_private" variant="secondary" class="text-xs"
                                                >Private</Badge
                                            >
                                        </div>
                                        <p v-if="channel.topic" class="text-muted-foreground text-xs">
                                            {{ channel.topic }}
                                        </p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-1">
                                    <Button variant="ghost" size="icon" class="h-7 w-7" @click="openOverrides(channel)">
                                        <Shield class="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        class="h-7 w-7"
                                        @click="openEditChannel(channel)"
                                    >
                                        <Pencil class="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        class="text-destructive hover:text-destructive h-7 w-7"
                                        @click="openDeleteChannel(channel)"
                                    >
                                        <Trash2 class="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>

                            <div
                                v-if="category.channels.length === 0"
                                class="text-muted-foreground px-4 py-4 text-center text-xs"
                            >
                                No channels in this category.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <Dialog v-model:open="showCreateChannelDialog">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Create Channel</DialogTitle>
                    <DialogDescription>Add a new channel to the server.</DialogDescription>
                </DialogHeader>

                <form @submit.prevent="submitCreateChannel" class="space-y-4">
                    <div class="grid gap-2">
                        <Label for="ch-name">Name</Label>
                        <Input id="ch-name" v-model="channelForm.name" placeholder="channel-name" />
                        <p v-if="channelErrors.name" class="text-destructive text-sm">{{ channelErrors.name }}</p>
                    </div>

                    <div class="grid gap-2">
                        <Label for="ch-type">Type</Label>
                        <select
                            id="ch-type"
                            v-model="channelForm.type"
                            class="border-input focus-visible:ring-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-1 focus-visible:outline-none"
                        >
                            <option value="text">Text</option>
                            <option value="voice">Voice</option>
                        </select>
                    </div>

                    <div class="grid gap-2">
                        <Label for="ch-topic">Topic</Label>
                        <Input id="ch-topic" v-model="channelForm.topic" placeholder="What's this channel about?" />
                    </div>

                    <div class="grid gap-2">
                        <Label for="ch-category">Category</Label>
                        <select
                            id="ch-category"
                            v-model="channelForm.category_id"
                            class="border-input focus-visible:ring-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-1 focus-visible:outline-none"
                        >
                            <option :value="null">None</option>
                            <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                                {{ cat.name }}
                            </option>
                        </select>
                    </div>

                    <div class="flex items-center gap-2">
                        <Checkbox
                            id="ch-private"
                            :model-value="channelForm.is_private"
                            @update:model-value="channelForm.is_private = !!$event"
                        />
                        <Label for="ch-private" class="text-sm"
                            >Private channel (requires explicit role/user access)</Label
                        >
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" @click="showCreateChannelDialog = false">Cancel</Button>
                        <Button type="submit" :disabled="processing">Create Channel</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="showEditChannelDialog">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit Channel</DialogTitle>
                    <DialogDescription>Update channel settings.</DialogDescription>
                </DialogHeader>

                <form @submit.prevent="submitEditChannel" class="space-y-4">
                    <div class="grid gap-2">
                        <Label for="ech-name">Name</Label>
                        <Input id="ech-name" v-model="editChannelForm.name" />
                        <p v-if="editChannelErrors.name" class="text-destructive text-sm">
                            {{ editChannelErrors.name }}
                        </p>
                    </div>

                    <div class="grid gap-2">
                        <Label for="ech-type">Type</Label>
                        <select
                            id="ech-type"
                            v-model="editChannelForm.type"
                            class="border-input focus-visible:ring-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-1 focus-visible:outline-none"
                        >
                            <option value="text">Text</option>
                            <option value="voice">Voice</option>
                        </select>
                    </div>

                    <div class="grid gap-2">
                        <Label for="ech-topic">Topic</Label>
                        <Input id="ech-topic" v-model="editChannelForm.topic" />
                    </div>

                    <div class="grid gap-2">
                        <Label for="ech-category">Category</Label>
                        <select
                            id="ech-category"
                            v-model="editChannelForm.category_id"
                            class="border-input focus-visible:ring-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-1 focus-visible:outline-none"
                        >
                            <option :value="null">None</option>
                            <option v-for="cat in categories" :key="cat.id" :value="cat.id">
                                {{ cat.name }}
                            </option>
                        </select>
                    </div>

                    <div class="grid gap-2">
                        <Label for="ech-slowmode">Slowmode (seconds)</Label>
                        <Input
                            id="ech-slowmode"
                            type="number"
                            v-model.number="editChannelForm.slowmode_seconds"
                            min="0"
                            max="21600"
                        />
                    </div>

                    <div class="flex items-center gap-2">
                        <Checkbox
                            id="ech-private"
                            :model-value="editChannelForm.is_private"
                            @update:model-value="editChannelForm.is_private = !!$event"
                        />
                        <Label for="ech-private" class="text-sm">Private channel</Label>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" @click="showEditChannelDialog = false">Cancel</Button>
                        <Button type="submit" :disabled="processing">Save Changes</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="showDeleteChannelDialog">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Delete Channel</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to delete
                        <strong>{{ deletingChannel?.name }}</strong
                        >? All messages in this channel will be lost. This cannot be undone.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" @click="showDeleteChannelDialog = false">Cancel</Button>
                    <Button variant="destructive" :disabled="processing" @click="confirmDeleteChannel"
                        >Delete Channel</Button
                    >
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="showCreateCategoryDialog">
            <DialogContent class="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Create Category</DialogTitle>
                    <DialogDescription>Add a new category to organize channels.</DialogDescription>
                </DialogHeader>

                <form @submit.prevent="submitCreateCategory" class="space-y-4">
                    <div class="grid gap-2">
                        <Label for="cat-name">Name</Label>
                        <Input id="cat-name" v-model="categoryForm.name" placeholder="Category name" />
                        <p v-if="categoryErrors.name" class="text-destructive text-sm">{{ categoryErrors.name }}</p>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" @click="showCreateCategoryDialog = false"
                            >Cancel</Button
                        >
                        <Button type="submit" :disabled="processing">Create</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="showEditCategoryDialog">
            <DialogContent class="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Edit Category</DialogTitle>
                    <DialogDescription>Update the category name.</DialogDescription>
                </DialogHeader>

                <form @submit.prevent="submitEditCategory" class="space-y-4">
                    <div class="grid gap-2">
                        <Label for="ecat-name">Name</Label>
                        <Input id="ecat-name" v-model="editCategoryForm.name" />
                        <p v-if="editCategoryErrors.name" class="text-destructive text-sm">
                            {{ editCategoryErrors.name }}
                        </p>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" @click="showEditCategoryDialog = false">Cancel</Button>
                        <Button type="submit" :disabled="processing">Save</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="showDeleteCategoryDialog">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Delete Category</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to delete
                        <strong>{{ deletingCategory?.name }}</strong
                        >? All channels in this category will also be deleted. This cannot be undone.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" @click="showDeleteCategoryDialog = false">Cancel</Button>
                    <Button variant="destructive" :disabled="processing" @click="confirmDeleteCategory"
                        >Delete Category</Button
                    >
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="showOverridesDialog">
            <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Permission Overrides</DialogTitle>
                    <DialogDescription>
                        Manage permission overrides for
                        <strong>#{{ overridesChannel?.name }}</strong
                        >. Overrides allow or deny specific permissions for roles on this channel.
                    </DialogDescription>
                </DialogHeader>

                <div v-if="loadingOverrides" class="text-muted-foreground py-4 text-center text-sm">Loading...</div>

                <div v-else class="space-y-4">
                    <div v-if="channelOverrides.length > 0" class="space-y-2">
                        <h3 class="text-sm font-semibold">Current Overrides</h3>
                        <div
                            v-for="override in channelOverrides"
                            :key="override.id"
                            class="border-border rounded-lg border p-3"
                        >
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <div
                                        v-if="override.role"
                                        class="h-3 w-3 rounded-full"
                                        :style="{ backgroundColor: override.role.color }"
                                    />
                                    <span class="text-sm font-medium">
                                        {{ override.role?.name ?? override.user?.username ?? 'Unknown' }}
                                    </span>
                                    <Badge variant="secondary" class="text-xs">
                                        {{ override.role ? 'Role' : 'User' }}
                                    </Badge>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    class="text-destructive hover:text-destructive h-7 w-7"
                                    @click="deleteOverrideAction(override)"
                                >
                                    <Trash2 class="h-3.5 w-3.5" />
                                </Button>
                            </div>
                            <div class="mt-2 flex flex-wrap gap-1">
                                <Badge
                                    v-for="perm in override.allow"
                                    :key="`allow-${perm}`"
                                    class="bg-green-500/10 text-xs text-green-600"
                                >
                                    + {{ getPermissionLabel(perm) }}
                                </Badge>
                                <Badge
                                    v-for="perm in override.deny"
                                    :key="`deny-${perm}`"
                                    variant="destructive"
                                    class="text-xs"
                                >
                                    - {{ getPermissionLabel(perm) }}
                                </Badge>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    <div>
                        <h3 class="mb-3 text-sm font-semibold">Add Override</h3>
                        <form @submit.prevent="submitOverride" class="space-y-3">
                            <div class="grid gap-2">
                                <Label for="ovr-role">Role</Label>
                                <select
                                    id="ovr-role"
                                    v-model="overrideForm.role_id"
                                    class="border-input focus-visible:ring-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:ring-1 focus-visible:outline-none"
                                >
                                    <option :value="null">Select a role...</option>
                                    <option v-for="role in availableOverrideRoles" :key="role.id" :value="role.id">
                                        {{ role.name }}
                                    </option>
                                </select>
                            </div>

                            <div class="space-y-2">
                                <p class="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                                    Permissions
                                </p>
                                <div class="grid gap-1.5">
                                    <div
                                        v-for="perm in channelPermissions"
                                        :key="perm"
                                        class="flex items-center justify-between rounded px-2 py-1 text-sm"
                                    >
                                        <span>{{ getPermissionLabel(perm) }}</span>
                                        <div class="flex items-center gap-2">
                                            <button
                                                type="button"
                                                :class="[
                                                    'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                                                    overrideForm.allow.includes(perm)
                                                        ? 'bg-green-500 text-white'
                                                        : 'bg-muted text-muted-foreground hover:bg-muted/80',
                                                ]"
                                                @click="toggleOverridePermission('allow', perm)"
                                            >
                                                Allow
                                            </button>
                                            <button
                                                type="button"
                                                :class="[
                                                    'rounded px-2 py-0.5 text-xs font-medium transition-colors',
                                                    overrideForm.deny.includes(perm)
                                                        ? 'bg-destructive text-destructive-foreground'
                                                        : 'bg-muted text-muted-foreground hover:bg-muted/80',
                                                ]"
                                                @click="toggleOverridePermission('deny', perm)"
                                            >
                                                Deny
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <DialogFooter>
                                <Button type="submit" :disabled="processing || !overrideForm.role_id" size="sm">
                                    Save Override
                                </Button>
                            </DialogFooter>
                        </form>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    </div>
</template>
