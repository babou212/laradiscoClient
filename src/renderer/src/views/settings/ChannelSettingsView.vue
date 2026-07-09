<script setup lang="ts">
import { useQuery, useMutation, useQueryCache } from '@pinia/colada';
import {
    ArrowLeft,
    ChevronDown,
    ChevronRight,
    Folder,
    GripVertical,
    Hash,
    Lock,
    Pencil,
    Plus,
    Search,
    Shield,
    Trash2,
    Volume2,
    X,
} from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import draggable from 'vuedraggable';
import { extractValidationErrors } from '@/api/errors';
import {
    createSettingsChannel,
    updateSettingsChannel,
    deleteSettingsChannel,
    reorderSettingsChannels,
    reorderSettingsCategories,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { SETTINGS_KEYS } from '@/queries/keys';
import { settingsChannelsQuery } from '@/queries/settings/channels';
import { settingsMembersQuery } from '@/queries/settings/members';

const { t } = useI18n();

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

type Member = {
    id: string;
    username: string;
    display_name: string;
};

const queryCache = useQueryCache();
const { data: rawData, isLoading } = useQuery(settingsChannelsQuery);
const { data: membersRawData } = useQuery(settingsMembersQuery);

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

const orderedCategories = ref<Category[]>([]);
watch(
    categories,
    (cats) => {
        orderedCategories.value = cats.map((c) => ({ ...c, channels: c.channels.map((ch) => ({ ...ch })) }));
    },
    { immediate: true },
);

const roles = computed<Role[]>(() => {
    const metaRoles = rawData.value?.meta?.roles;
    if (!Array.isArray(metaRoles)) return [];
    return metaRoles.map((r: any) => ({
        id: String(r.id),
        name: r.attributes?.name ?? r.name ?? '',
        color: r.attributes?.color ?? r.color ?? '#99AAB5',
    }));
});

const allPermissions = computed<Permission[]>(() => {
    const metaPerms = rawData.value?.meta?.permissions;
    if (Array.isArray(metaPerms)) return metaPerms as unknown as Permission[];
    return [];
});

const allMembers = computed<Member[]>(() => {
    if (!membersRawData.value?.data) return [];
    return membersRawData.value.data.map((res) => ({
        id: res.id,
        username: res.attributes.username,
        display_name: res.attributes.display_name ?? res.attributes.username,
    }));
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
    user_id: null as string | null,
    allow: [] as string[],
    deny: [] as string[],
});

const channelErrors = ref<Record<string, string>>({});
const editChannelErrors = ref<Record<string, string>>({});
const categoryErrors = ref<Record<string, string>>({});
const editCategoryErrors = ref<Record<string, string>>({});

const textChannelPermissions = [
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
];

const voiceChannelPermissions = ['view_channels', 'connect', 'speak', 'video', 'mute_members', 'deafen_members'];

const detailPermissions = computed(() =>
    overridesChannel.value?.type === 'voice' ? voiceChannelPermissions : textChannelPermissions,
);

const availableOverrideRoles = computed(() => {
    const existingRoleIds = new Set(channelOverrides.value.filter((o) => o.role_id).map((o) => o.role_id));
    return roles.value.filter((r) => !existingRoleIds.has(Number(r.id)));
});

const roleOverrides = computed(() => channelOverrides.value.filter((o) => o.role_id != null));
const userOverrides = computed(() => channelOverrides.value.filter((o) => o.user_id != null));

const availableOverrideMembers = computed(() => {
    const existingUserIds = new Set(channelOverrides.value.filter((o) => o.user_id).map((o) => o.user_id));
    return allMembers.value.filter((m) => !existingUserIds.has(Number(m.id)));
});

const showAddAccessDialog = ref(false);
const showDisablePrivateConfirm = ref(false);
const addAccessSearch = ref('');
const addingRoleId = ref<string | null>(null);
const addingUserId = ref<string | null>(null);

const filteredPickerRoles = computed(() => {
    const q = addAccessSearch.value.trim().toLowerCase();
    if (!q) return availableOverrideRoles.value;
    return availableOverrideRoles.value.filter((r) => r.name.toLowerCase().includes(q));
});

const filteredPickerMembers = computed(() => {
    const q = addAccessSearch.value.trim().toLowerCase();
    if (!q) return availableOverrideMembers.value;
    return availableOverrideMembers.value.filter(
        (m) => m.username.toLowerCase().includes(q) || m.display_name.toLowerCase().includes(q),
    );
});

const selectedOverride = ref<ChannelOverride | null>(null);

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
            category_id: data.category_id || null,
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

const { mutateAsync: doTogglePrivate } = useMutation({
    mutation: (params: { id: string; is_private: boolean }) =>
        updateSettingsChannel(params.id, { is_private: params.is_private }),
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

const { mutate: doReorderChannels } = useMutation({
    mutation: (payload: { categories: { id: string; channel_ids: string[] }[] }) => reorderSettingsChannels(payload),
    onSettled: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.channels() }),
});

const { mutate: doReorderCategories } = useMutation({
    mutation: (ids: string[]) => reorderSettingsCategories(ids),
    onSettled: () => queryCache.invalidateQueries({ key: SETTINGS_KEYS.channels() }),
});

function persistCategoryOrder() {
    doReorderCategories(orderedCategories.value.map((c) => c.id));
}

function persistChannelOrder() {
    doReorderChannels({
        categories: orderedCategories.value.map((c) => ({
            id: c.id,
            channel_ids: c.channels.map((ch) => ch.id),
        })),
    });
}

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

async function refreshOverrides(channelId: string) {
    try {
        const data = await getChannelOverrides(channelId);
        channelOverrides.value = data as ChannelOverride[];
    } catch {
        channelOverrides.value = [];
    }
}

async function openOverrides(channel: Channel) {
    overridesChannel.value = channel;
    selectedOverride.value = null;
    loadingOverrides.value = true;
    showOverridesDialog.value = true;

    await refreshOverrides(channel.id);
    loadingOverrides.value = false;
}

function togglePrivate(value: boolean) {
    if (!overridesChannel.value) return;
    if (!value && channelOverrides.value.length > 0) {
        showDisablePrivateConfirm.value = true;
        return;
    }
    overridesChannel.value = { ...overridesChannel.value, is_private: value };
    doTogglePrivate({ id: overridesChannel.value.id, is_private: value });
}

async function confirmDisablePrivate() {
    if (!overridesChannel.value) return;
    const channelId = overridesChannel.value.id;
    processing.value = true;
    try {
        await Promise.all(channelOverrides.value.map((o) => deleteChannelOverride(channelId, String(o.id))));
        channelOverrides.value = [];
        overridesChannel.value = { ...overridesChannel.value, is_private: false };
        await doTogglePrivate({ id: channelId, is_private: false });
        showDisablePrivateConfirm.value = false;
    } catch {
        // handle
    } finally {
        processing.value = false;
    }
}

function openOverrideDetail(override: ChannelOverride) {
    selectedOverride.value = override;
    overrideForm.value = {
        role_id: override.role_id != null ? String(override.role_id) : null,
        user_id: override.user_id != null ? String(override.user_id) : null,
        allow: [...override.allow],
        deny: [...override.deny],
    };
}

function backToRoster() {
    selectedOverride.value = null;
}

async function submitOverride() {
    if (!overridesChannel.value) return;
    processing.value = true;
    try {
        await createChannelOverride(overridesChannel.value.id, overrideForm.value);
        await refreshOverrides(overridesChannel.value.id);
        selectedOverride.value = null;
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
        await refreshOverrides(overridesChannel.value.id);
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

function openAddAccessDialog() {
    addingRoleId.value = null;
    addingUserId.value = null;
    addAccessSearch.value = '';
    showAddAccessDialog.value = true;
}

async function addRoleAccess(roleId: string) {
    if (!overridesChannel.value || addingRoleId.value) return;
    addingRoleId.value = roleId;
    try {
        const allow = overridesChannel.value.is_private ? ['view_channels'] : [];
        await createChannelOverride(overridesChannel.value.id, { role_id: roleId, allow, deny: [] });
        await refreshOverrides(overridesChannel.value.id);
    } catch {
        // handle
    } finally {
        addingRoleId.value = null;
    }
}

async function addUserAccess(userId: string) {
    if (!overridesChannel.value || addingUserId.value) return;
    addingUserId.value = userId;
    try {
        const allow = overridesChannel.value.is_private ? ['view_channels'] : [];
        await createChannelOverride(overridesChannel.value.id, { user_id: userId, allow, deny: [] });
        await refreshOverrides(overridesChannel.value.id);
    } catch {
        // handle
    } finally {
        addingUserId.value = null;
    }
}
</script>

<template>
    <div>
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 flex items-center justify-between border-b px-6 py-4">
                <div>
                    <h2 class="text-lg font-semibold">{{ t('settings.channels.title') }}</h2>
                    <p class="text-muted-foreground mt-1 text-sm">
                        {{ t('settings.channels.description') }}
                    </p>
                </div>
                <div class="flex gap-2">
                    <Button @click="openCreateCategory" size="sm" variant="outline">
                        <Folder class="mr-1.5 h-4 w-4" />
                        {{ t('settings.channels.newCategory') }}
                    </Button>
                    <Button @click="openCreateChannel()" size="sm">
                        <Plus class="mr-1.5 h-4 w-4" />
                        {{ t('settings.channels.newChannel') }}
                    </Button>
                </div>
            </div>

            <div class="p-6">
                <!-- Loading -->
                <div v-if="isLoading" class="flex items-center justify-center py-8">
                    <div class="text-muted-foreground text-sm">{{ t('settings.channels.loading') }}</div>
                </div>

                <!-- Empty -->
                <div
                    v-else-if="categories.length === 0"
                    class="flex flex-col items-center justify-center py-8 text-center"
                >
                    <div class="border-border bg-muted mb-3 rounded-full border p-3">
                        <Hash class="text-muted-foreground h-6 w-6" />
                    </div>
                    <p class="text-sm font-medium">{{ t('settings.channels.emptyTitle') }}</p>
                    <p class="text-muted-foreground mt-1 text-sm">{{ t('settings.channels.emptyDescription') }}</p>
                </div>

                <!-- Category list -->
                <draggable
                    v-else
                    v-model="orderedCategories"
                    item-key="id"
                    handle=".category-drag-handle"
                    :group="{ name: 'categories' }"
                    :animation="150"
                    :force-fallback="true"
                    ghost-class="category-ghost"
                    drag-class="category-dragging"
                    class="space-y-4"
                    @end="persistCategoryOrder"
                >
                    <template #item="{ element: category }">
                        <div class="border-border rounded-lg border">
                            <!-- Category Header -->
                            <div
                                class="bg-muted/30 flex cursor-pointer items-center justify-between px-4 py-3"
                                @click="toggleCategory(category.id)"
                            >
                                <div class="flex items-center gap-2">
                                    <button
                                        type="button"
                                        class="category-drag-handle text-muted-foreground/50 hover:text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing"
                                        :aria-label="t('settings.channels.dragCategory')"
                                        @click.stop
                                    >
                                        <GripVertical class="h-4 w-4" />
                                    </button>
                                    <component
                                        :is="expandedCategories.has(category.id) ? ChevronDown : ChevronRight"
                                        class="text-muted-foreground h-4 w-4"
                                    />
                                    <span class="text-sm font-semibold tracking-wider uppercase">
                                        {{ category.name }}
                                    </span>
                                    <span class="text-muted-foreground text-xs">
                                        ({{ category.channels.length }})
                                    </span>
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
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        class="h-7 w-7"
                                        @click="openEditCategory(category)"
                                    >
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
                            <div v-show="expandedCategories.has(category.id)">
                                <draggable
                                    v-model="category.channels"
                                    item-key="id"
                                    handle=".channel-drag-handle"
                                    :group="{ name: 'channels' }"
                                    :animation="150"
                                    :force-fallback="true"
                                    ghost-class="channel-ghost"
                                    drag-class="channel-dragging"
                                    class="divide-y"
                                    @end="persistChannelOrder"
                                >
                                    <template #item="{ element: channel }">
                                        <div class="flex items-center justify-between px-4 py-3">
                                            <div class="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    class="channel-drag-handle text-muted-foreground/50 hover:text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing"
                                                    :aria-label="t('settings.channels.dragChannel')"
                                                >
                                                    <GripVertical class="h-4 w-4" />
                                                </button>
                                                <component
                                                    :is="channelIcon(channel.type)"
                                                    class="text-muted-foreground h-4 w-4"
                                                />
                                                <div>
                                                    <div class="flex items-center gap-2">
                                                        <span class="text-sm font-medium">{{ channel.name }}</span>
                                                        <Lock
                                                            v-if="channel.is_private"
                                                            class="text-muted-foreground h-3 w-3"
                                                        />
                                                        <Badge
                                                            v-if="channel.is_private"
                                                            variant="secondary"
                                                            class="text-xs"
                                                            >{{ t('settings.channels.privateBadge') }}</Badge
                                                        >
                                                    </div>
                                                    <p v-if="channel.topic" class="text-muted-foreground text-xs">
                                                        {{ channel.topic }}
                                                    </p>
                                                </div>
                                            </div>
                                            <div class="flex items-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    class="h-7 w-7"
                                                    @click="openOverrides(channel)"
                                                >
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
                                    </template>
                                </draggable>

                                <div
                                    v-if="category.channels.length === 0"
                                    class="text-muted-foreground px-4 py-4 text-center text-xs"
                                >
                                    {{ t('settings.channels.emptyCategory') }}
                                </div>
                            </div>
                        </div>
                    </template>
                </draggable>
            </div>
        </div>

        <Dialog v-model:open="showCreateChannelDialog">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{{ t('settings.channels.create.title') }}</DialogTitle>
                    <DialogDescription>{{ t('settings.channels.create.description') }}</DialogDescription>
                </DialogHeader>

                <form @submit.prevent="submitCreateChannel" class="space-y-4">
                    <div class="grid gap-2">
                        <Label for="ch-name">{{ t('settings.channels.create.name') }}</Label>
                        <Input
                            id="ch-name"
                            v-model="channelForm.name"
                            :placeholder="t('settings.channels.create.namePlaceholder')"
                        />
                        <p v-if="channelErrors.name" class="text-destructive text-sm">{{ channelErrors.name }}</p>
                    </div>

                    <div class="grid gap-2">
                        <Label>{{ t('settings.channels.create.type') }}</Label>
                        <Select v-model="channelForm.type">
                            <SelectTrigger>
                                <SelectValue :placeholder="t('settings.channels.create.typePlaceholder')" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="text">{{ t('settings.channels.create.typeText') }}</SelectItem>
                                <SelectItem value="voice">{{ t('settings.channels.create.typeVoice') }}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div class="grid gap-2">
                        <Label for="ch-topic">{{ t('settings.channels.create.topic') }}</Label>
                        <Input
                            id="ch-topic"
                            v-model="channelForm.topic"
                            :placeholder="t('settings.channels.create.topicPlaceholder')"
                        />
                    </div>

                    <div class="grid gap-2">
                        <Label>{{ t('settings.channels.create.category') }}</Label>
                        <Select v-model="channelForm.category_id">
                            <SelectTrigger>
                                <SelectValue :placeholder="t('settings.channels.create.categoryNone')" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem :value="null as any">{{
                                    t('settings.channels.create.categoryNone')
                                }}</SelectItem>
                                <SelectItem v-for="cat in categories" :key="cat.id" :value="cat.id">
                                    {{ cat.name }}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div class="flex items-center gap-2">
                        <Checkbox
                            id="ch-private"
                            :model-value="channelForm.is_private"
                            @update:model-value="channelForm.is_private = !!$event"
                        />
                        <Label for="ch-private" class="text-sm">{{ t('settings.channels.create.privateLabel') }}</Label>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" @click="showCreateChannelDialog = false">{{
                            t('settings.common.cancel')
                        }}</Button>
                        <Button type="submit" :disabled="processing">{{ t('settings.channels.create.submit') }}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="showEditChannelDialog">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{{ t('settings.channels.edit.title') }}</DialogTitle>
                    <DialogDescription>{{ t('settings.channels.edit.description') }}</DialogDescription>
                </DialogHeader>

                <form @submit.prevent="submitEditChannel" class="space-y-4">
                    <div class="grid gap-2">
                        <Label for="ech-name">{{ t('settings.channels.edit.name') }}</Label>
                        <Input id="ech-name" v-model="editChannelForm.name" />
                        <p v-if="editChannelErrors.name" class="text-destructive text-sm">
                            {{ editChannelErrors.name }}
                        </p>
                    </div>

                    <div class="grid gap-2">
                        <Label>{{ t('settings.channels.create.type') }}</Label>
                        <Select v-model="editChannelForm.type">
                            <SelectTrigger>
                                <SelectValue :placeholder="t('settings.channels.create.typePlaceholder')" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="text">{{ t('settings.channels.create.typeText') }}</SelectItem>
                                <SelectItem value="voice">{{ t('settings.channels.create.typeVoice') }}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div class="grid gap-2">
                        <Label for="ech-topic">{{ t('settings.channels.edit.topic') }}</Label>
                        <Input id="ech-topic" v-model="editChannelForm.topic" />
                    </div>

                    <div class="grid gap-2">
                        <Label>{{ t('settings.channels.edit.category') }}</Label>
                        <Select v-model="editChannelForm.category_id">
                            <SelectTrigger>
                                <SelectValue :placeholder="t('settings.channels.create.categoryNone')" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem :value="null as any">{{
                                    t('settings.channels.create.categoryNone')
                                }}</SelectItem>
                                <SelectItem v-for="cat in categories" :key="cat.id" :value="cat.id">
                                    {{ cat.name }}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div class="grid gap-2">
                        <Label for="ech-slowmode">{{ t('settings.channels.edit.slowmode') }}</Label>
                        <Input
                            id="ech-slowmode"
                            type="number"
                            v-model.number="editChannelForm.slowmode_seconds"
                            min="0"
                            max="21600"
                        />
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" @click="showEditChannelDialog = false">{{
                            t('settings.common.cancel')
                        }}</Button>
                        <Button type="submit" :disabled="processing">{{ t('settings.channels.edit.submit') }}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="showDeleteChannelDialog">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{{ t('settings.channels.delete.title') }}</DialogTitle>
                    <DialogDescription>
                        {{ t('settings.channels.delete.description', { name: deletingChannel?.name ?? '' }) }}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" @click="showDeleteChannelDialog = false">{{
                        t('settings.common.cancel')
                    }}</Button>
                    <Button variant="destructive" :disabled="processing" @click="confirmDeleteChannel">{{
                        t('settings.channels.delete.submit')
                    }}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="showCreateCategoryDialog">
            <DialogContent class="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>{{ t('settings.channels.category.createTitle') }}</DialogTitle>
                    <DialogDescription>{{ t('settings.channels.category.createDescription') }}</DialogDescription>
                </DialogHeader>

                <form @submit.prevent="submitCreateCategory" class="space-y-4">
                    <div class="grid gap-2">
                        <Label for="cat-name">{{ t('settings.channels.category.name') }}</Label>
                        <Input
                            id="cat-name"
                            v-model="categoryForm.name"
                            :placeholder="t('settings.channels.category.namePlaceholder')"
                        />
                        <p v-if="categoryErrors.name" class="text-destructive text-sm">{{ categoryErrors.name }}</p>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" @click="showCreateCategoryDialog = false">{{
                            t('settings.common.cancel')
                        }}</Button>
                        <Button type="submit" :disabled="processing">{{
                            t('settings.channels.category.create')
                        }}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="showEditCategoryDialog">
            <DialogContent class="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>{{ t('settings.channels.category.editTitle') }}</DialogTitle>
                    <DialogDescription>{{ t('settings.channels.category.editDescription') }}</DialogDescription>
                </DialogHeader>

                <form @submit.prevent="submitEditCategory" class="space-y-4">
                    <div class="grid gap-2">
                        <Label for="ecat-name">{{ t('settings.channels.category.name') }}</Label>
                        <Input id="ecat-name" v-model="editCategoryForm.name" />
                        <p v-if="editCategoryErrors.name" class="text-destructive text-sm">
                            {{ editCategoryErrors.name }}
                        </p>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" @click="showEditCategoryDialog = false">{{
                            t('settings.common.cancel')
                        }}</Button>
                        <Button type="submit" :disabled="processing">{{ t('settings.channels.category.save') }}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="showDeleteCategoryDialog">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{{ t('settings.channels.category.deleteTitle') }}</DialogTitle>
                    <DialogDescription>
                        {{
                            t('settings.channels.category.deleteDescription', {
                                name: deletingCategory?.name ?? '',
                            })
                        }}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" @click="showDeleteCategoryDialog = false">{{
                        t('settings.common.cancel')
                    }}</Button>
                    <Button variant="destructive" :disabled="processing" @click="confirmDeleteCategory">{{
                        t('settings.channels.category.deleteSubmit')
                    }}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="showOverridesDialog">
            <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader v-if="!selectedOverride">
                    <DialogTitle>{{ t('settings.channels.permissions.title') }}</DialogTitle>
                    <DialogDescription>
                        {{ t('settings.channels.permissions.description', { name: overridesChannel?.name ?? '' }) }}
                    </DialogDescription>
                </DialogHeader>
                <DialogHeader v-else>
                    <DialogTitle class="flex items-center gap-2">
                        <Button variant="ghost" size="icon" class="-ml-1.5 h-6 w-6" @click="backToRoster">
                            <ArrowLeft class="h-4 w-4" />
                        </Button>
                        {{
                            t('settings.channels.permissions.detail.title', {
                                name: selectedOverride.role?.name ?? selectedOverride.user?.username ?? '',
                            })
                        }}
                    </DialogTitle>
                </DialogHeader>

                <div v-if="loadingOverrides" class="text-muted-foreground py-4 text-center text-sm">
                    {{ t('settings.channels.permissions.loading') }}
                </div>

                <div v-else-if="!selectedOverride" class="space-y-4">
                    <div class="border-border flex items-center justify-between gap-4 rounded-lg border p-3">
                        <div class="flex items-center gap-2">
                            <Lock class="text-muted-foreground h-4 w-4 shrink-0" />
                            <div>
                                <p class="text-sm font-medium">
                                    {{ t('settings.channels.permissions.private.label') }}
                                </p>
                                <p class="text-muted-foreground text-xs">
                                    {{ t('settings.channels.permissions.private.description') }}
                                </p>
                            </div>
                        </div>
                        <Checkbox
                            :model-value="overridesChannel?.is_private ?? false"
                            @update:model-value="togglePrivate(!!$event)"
                        />
                    </div>

                    <Separator />

                    <div class="flex items-center justify-between">
                        <h3 class="text-sm font-semibold">
                            {{
                                overridesChannel?.is_private
                                    ? t('settings.channels.permissions.access.heading')
                                    : t('settings.channels.permissions.access.headingPublic')
                            }}
                        </h3>
                        <Button size="sm" @click="openAddAccessDialog">
                            <Plus class="mr-1.5 h-3.5 w-3.5" />
                            {{ t('settings.channels.permissions.access.addButton') }}
                        </Button>
                    </div>

                    <div
                        v-if="roleOverrides.length === 0 && userOverrides.length === 0"
                        class="text-muted-foreground py-4 text-center text-sm"
                    >
                        {{
                            overridesChannel?.is_private
                                ? t('settings.channels.permissions.access.empty')
                                : t('settings.channels.permissions.access.emptyPublic')
                        }}
                    </div>

                    <div v-if="roleOverrides.length > 0" class="space-y-2">
                        <h4 class="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                            {{ t('settings.channels.permissions.access.rolesHeading') }}
                        </h4>
                        <div
                            v-for="override in roleOverrides"
                            :key="override.id"
                            class="border-border hover:bg-muted/50 flex cursor-pointer items-center justify-between rounded-lg border p-2.5"
                            @click="openOverrideDetail(override)"
                        >
                            <div class="flex items-center gap-2">
                                <div
                                    class="h-3 w-3 shrink-0 rounded-full"
                                    :style="{ backgroundColor: override.role?.color }"
                                />
                                <span class="text-sm font-medium">
                                    {{ override.role?.name ?? t('settings.channels.unknown') }}
                                </span>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                class="text-muted-foreground hover:text-destructive h-7 w-7"
                                @click.stop="deleteOverrideAction(override)"
                            >
                                <X class="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>

                    <div v-if="userOverrides.length > 0" class="space-y-2">
                        <h4 class="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                            {{ t('settings.channels.permissions.access.membersHeading') }}
                        </h4>
                        <div
                            v-for="override in userOverrides"
                            :key="override.id"
                            class="border-border hover:bg-muted/50 flex cursor-pointer items-center justify-between rounded-lg border p-2.5"
                            @click="openOverrideDetail(override)"
                        >
                            <div class="flex items-center gap-2">
                                <div
                                    class="bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                                >
                                    {{ (override.user?.username ?? '?').charAt(0).toUpperCase() }}
                                </div>
                                <span class="text-sm font-medium">
                                    {{ override.user?.username ?? t('settings.channels.unknown') }}
                                </span>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                class="text-muted-foreground hover:text-destructive h-7 w-7"
                                @click.stop="deleteOverrideAction(override)"
                            >
                                <X class="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                </div>

                <form v-else @submit.prevent="submitOverride" class="space-y-3">
                    <div class="space-y-2">
                        <p class="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                            {{ t('settings.channels.permissions.permissions') }}
                        </p>
                        <div class="grid gap-1.5">
                            <div
                                v-for="perm in detailPermissions"
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
                                        {{ t('settings.channels.permissions.allow') }}
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
                                        {{ t('settings.channels.permissions.deny') }}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button type="button" variant="outline" size="sm" @click="backToRoster">
                            {{ t('settings.common.cancel') }}
                        </Button>
                        <Button type="submit" :disabled="processing" size="sm">
                            {{ t('settings.channels.permissions.save') }}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="showAddAccessDialog">
            <DialogContent class="max-h-[85vh] overflow-y-auto sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{{ t('settings.channels.permissions.picker.title') }}</DialogTitle>
                    <DialogDescription>{{ t('settings.channels.permissions.picker.description') }}</DialogDescription>
                </DialogHeader>

                <div class="relative">
                    <Search class="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                    <Input
                        v-model="addAccessSearch"
                        :placeholder="t('settings.channels.permissions.picker.searchPlaceholder')"
                        class="pl-9"
                    />
                </div>

                <div
                    v-if="filteredPickerRoles.length === 0 && filteredPickerMembers.length === 0"
                    class="text-muted-foreground py-4 text-center text-sm"
                >
                    {{ t('settings.channels.permissions.picker.noResults') }}
                </div>

                <div v-if="filteredPickerRoles.length > 0" class="space-y-1">
                    <h4 class="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                        {{ t('settings.channels.permissions.picker.rolesHeading') }}
                    </h4>
                    <button
                        v-for="role in filteredPickerRoles"
                        :key="role.id"
                        type="button"
                        class="hover:bg-muted/50 flex w-full cursor-pointer items-center gap-2 rounded-lg p-2 text-left disabled:cursor-wait disabled:opacity-50"
                        :disabled="addingRoleId === role.id"
                        @click="addRoleAccess(role.id)"
                    >
                        <div class="h-3 w-3 shrink-0 rounded-full" :style="{ backgroundColor: role.color }" />
                        <span class="text-sm">{{ role.name }}</span>
                    </button>
                </div>

                <div v-if="filteredPickerMembers.length > 0" class="space-y-1">
                    <h4 class="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                        {{ t('settings.channels.permissions.picker.membersHeading') }}
                    </h4>
                    <button
                        v-for="member in filteredPickerMembers"
                        :key="member.id"
                        type="button"
                        class="hover:bg-muted/50 flex w-full cursor-pointer items-center gap-2 rounded-lg p-2 text-left disabled:cursor-wait disabled:opacity-50"
                        :disabled="addingUserId === member.id"
                        @click="addUserAccess(member.id)"
                    >
                        <div
                            class="bg-muted flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                        >
                            {{ member.display_name.charAt(0).toUpperCase() }}
                        </div>
                        <span class="text-sm">{{ member.display_name }}</span>
                    </button>
                </div>

                <DialogFooter>
                    <Button type="button" size="sm" @click="showAddAccessDialog = false">
                        {{ t('settings.channels.permissions.picker.done') }}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog v-model:open="showDisablePrivateConfirm">
            <DialogContent class="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{{ t('settings.channels.permissions.disableConfirm.title') }}</DialogTitle>
                    <DialogDescription>
                        {{ t('settings.channels.permissions.disableConfirm.description') }}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" @click="showDisablePrivateConfirm = false">{{
                        t('settings.common.cancel')
                    }}</Button>
                    <Button variant="destructive" :disabled="processing" @click="confirmDisablePrivate">{{
                        t('settings.channels.permissions.disableConfirm.submit')
                    }}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </div>
</template>

<style scoped>
.channel-dragging {
    background-color: var(--card);
    opacity: 1;
}

.channel-ghost {
    opacity: 0.4;
}

.category-dragging {
    background-color: var(--card);
    opacity: 1;
}

.category-ghost {
    opacity: 0.4;
}
</style>
