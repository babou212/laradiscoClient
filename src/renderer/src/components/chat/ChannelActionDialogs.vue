<script setup lang="ts">
import { useMutation, useQueryCache } from '@pinia/colada';
import { useEventListener } from '@vueuse/core';
import { Hash, Volume2 } from 'lucide-vue-next';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { extractValidationErrors, getApiErrorMessage } from '@/api/errors';
import { createSettingsChannel, updateSettingsChannel, deleteSettingsChannel } from '@/api/settings';
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
import { SETTINGS_KEYS } from '@/queries/keys';
import { useChatStore } from '@/stores/chat';
import type { Channel } from '@/types/chat';

const { t } = useI18n();
const queryCache = useQueryCache();
const chatStore = useChatStore();

function findChannel(channelId: string): Channel | null {
    for (const category of chatStore.categories) {
        const channel = category.channels.find((c) => c.id === channelId);
        if (channel) return channel;
    }
    return null;
}

// --- Create channel ---
const showCreateChannelDialog = ref(false);
const createChannelCategoryId = ref<string | null>(null);
const createChannelFixedType = ref<'text' | 'voice' | null>(null);
const channelForm = ref({ name: '', type: 'text' as 'text' | 'voice', topic: '', is_private: false });
const channelErrors = ref<Record<string, string>>({});
const channelCreateError = ref('');

const { mutateAsync: doCreateChannel, isLoading: creatingChannel } = useMutation({
    mutation: (data: typeof channelForm.value) =>
        createSettingsChannel({
            name: data.name,
            category_id: createChannelCategoryId.value,
            channel_type: data.type,
            topic: data.topic || undefined,
            is_private: data.is_private,
        }),
});

function openCreateChannelDialog(categoryId: string, fixedType?: 'text' | 'voice') {
    createChannelCategoryId.value = categoryId;
    createChannelFixedType.value = fixedType ?? null;
    channelForm.value = { name: '', type: fixedType ?? 'text', topic: '', is_private: false };
    channelErrors.value = {};
    channelCreateError.value = '';
    showCreateChannelDialog.value = true;
}

async function submitCreateChannel() {
    channelErrors.value = {};
    channelCreateError.value = '';
    try {
        const resp = await doCreateChannel(channelForm.value);
        showCreateChannelDialog.value = false;

        // Immediately add the new channel to the sidebar without waiting for a
        // network refetch, which can be slow or return stale data under Octane.
        const catId = createChannelCategoryId.value;
        if (catId) {
            const cat = chatStore.categories.find((c) => c.id === catId);
            cat?.channels.push({
                id: resp.data.id,
                name: resp.data.attributes.name,
                topic: resp.data.attributes.topic ?? null,
                type: resp.data.attributes.channel_type,
                is_private: resp.data.attributes.is_private ?? false,
                permissions: resp.data.attributes.channelPermissions,
                has_unread: false,
            });
        }

        queryCache.invalidateQueries({ key: SETTINGS_KEYS.channels() });
    } catch (err: unknown) {
        channelErrors.value = extractValidationErrors(err);
        if (Object.keys(channelErrors.value).length === 0) {
            channelCreateError.value = getApiErrorMessage(err);
        }
    }
}

// --- Edit channel ---
const showEditChannelDialog = ref(false);
const editingChannelId = ref<string | null>(null);
const editChannelForm = ref({ name: '', topic: '', is_private: false });
const editChannelErrors = ref<Record<string, string>>({});

const { mutateAsync: doEditChannel, isLoading: editingChannel } = useMutation({
    mutation: (params: { id: string; data: typeof editChannelForm.value }) =>
        updateSettingsChannel(params.id, {
            name: params.data.name,
            topic: params.data.topic || undefined,
            is_private: params.data.is_private,
        }),
});

function openEditChannelDialog(channelId: string) {
    const channel = findChannel(channelId);
    if (!channel) return;
    editingChannelId.value = channelId;
    editChannelForm.value = { name: channel.name, topic: channel.topic ?? '', is_private: channel.is_private ?? false };
    editChannelErrors.value = {};
    showEditChannelDialog.value = true;
}

async function submitEditChannel() {
    if (!editingChannelId.value) return;
    editChannelErrors.value = {};
    try {
        await doEditChannel({ id: editingChannelId.value, data: editChannelForm.value });
        showEditChannelDialog.value = false;

        const id = editingChannelId.value;
        for (const cat of chatStore.categories) {
            const ch = cat.channels.find((c) => c.id === id);
            if (ch) {
                ch.name = editChannelForm.value.name;
                ch.topic = editChannelForm.value.topic || null;
                ch.is_private = editChannelForm.value.is_private;
                break;
            }
        }

        queryCache.invalidateQueries({ key: SETTINGS_KEYS.channels() });
    } catch (err: unknown) {
        editChannelErrors.value = extractValidationErrors(err);
    }
}

// --- Delete channel ---
const showDeleteChannelDialog = ref(false);
const deletingChannelId = ref<string | null>(null);
const deletingChannelName = ref('');

const { mutateAsync: doDeleteChannel, isLoading: deletingChannel } = useMutation({
    mutation: (id: string) => deleteSettingsChannel(id),
});

function openDeleteChannelDialog(channelId: string) {
    const channel = findChannel(channelId);
    if (!channel) return;
    deletingChannelId.value = channelId;
    deletingChannelName.value = channel.name;
    showDeleteChannelDialog.value = true;
}

async function confirmDeleteChannel() {
    if (!deletingChannelId.value) return;
    try {
        const id = deletingChannelId.value;
        await doDeleteChannel(id);
        showDeleteChannelDialog.value = false;
        deletingChannelId.value = null;

        for (const cat of chatStore.categories) {
            const idx = cat.channels.findIndex((c) => c.id === id);
            if (idx !== -1) {
                cat.channels.splice(idx, 1);
                break;
            }
        }

        queryCache.invalidateQueries({ key: SETTINGS_KEYS.channels() });
    } catch {
        // delete errors are rare; dialog stays open
    }
}

// --- Event wiring ---
function handleChannelAction(e: Event) {
    const detail = (e as CustomEvent<{ action: string; categoryId?: string; channelId?: string; channelType?: string }>)
        .detail;
    if (!detail) return;
    if (detail.action === 'create-channel' && detail.categoryId) {
        const fixedType = detail.channelType === 'voice' ? 'voice' : detail.channelType === 'text' ? 'text' : undefined;
        openCreateChannelDialog(detail.categoryId, fixedType);
    } else if (detail.action === 'edit-channel' && detail.channelId) {
        openEditChannelDialog(detail.channelId);
    } else if (detail.action === 'delete-channel' && detail.channelId) {
        openDeleteChannelDialog(detail.channelId);
    }
}

useEventListener(document, 'chat-channel-action', handleChannelAction);
</script>

<template>
    <Dialog v-model:open="showCreateChannelDialog">
        <DialogContent class="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>{{ t('settings.channels.create.title') }}</DialogTitle>
                <DialogDescription>{{ t('settings.channels.create.description') }}</DialogDescription>
            </DialogHeader>

            <div class="space-y-4">
                <div
                    v-if="channelCreateError"
                    class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
                >
                    {{ channelCreateError }}
                </div>

                <div class="grid gap-2">
                    <Label for="ctx-ch-name">{{ t('settings.channels.create.name') }}</Label>
                    <Input
                        id="ctx-ch-name"
                        v-model="channelForm.name"
                        :placeholder="t('settings.channels.create.namePlaceholder')"
                        @keydown.enter.prevent="submitCreateChannel"
                    />
                    <p v-if="channelErrors.name" class="text-destructive text-sm">{{ channelErrors.name }}</p>
                </div>

                <div class="grid gap-2">
                    <Label>{{ t('settings.channels.create.type') }}</Label>
                    <div
                        v-if="createChannelFixedType"
                        class="border-input bg-muted/50 text-muted-foreground flex h-9 w-full items-center gap-2 rounded-md border px-3 text-sm"
                    >
                        <component :is="createChannelFixedType === 'voice' ? Volume2 : Hash" class="size-4" />
                        {{
                            createChannelFixedType === 'voice'
                                ? t('settings.channels.create.typeVoice')
                                : t('settings.channels.create.typeText')
                        }}
                    </div>
                    <Select v-else v-model="channelForm.type">
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
                    <Label for="ctx-ch-topic">{{ t('settings.channels.create.topic') }}</Label>
                    <Input
                        id="ctx-ch-topic"
                        v-model="channelForm.topic"
                        :placeholder="t('settings.channels.create.topicPlaceholder')"
                        @keydown.enter.prevent="submitCreateChannel"
                    />
                </div>

                <div class="flex items-center gap-2">
                    <Checkbox
                        id="ctx-ch-private"
                        :model-value="channelForm.is_private"
                        @update:model-value="channelForm.is_private = !!$event"
                    />
                    <Label for="ctx-ch-private" class="text-sm">{{ t('settings.channels.create.privateLabel') }}</Label>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" @click="showCreateChannelDialog = false">{{
                        t('settings.common.cancel')
                    }}</Button>
                    <Button type="button" :disabled="creatingChannel" @click="submitCreateChannel">{{
                        t('settings.channels.create.submit')
                    }}</Button>
                </DialogFooter>
            </div>
        </DialogContent>
    </Dialog>

    <Dialog v-model:open="showEditChannelDialog">
        <DialogContent class="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>{{ t('settings.channels.edit.title') }}</DialogTitle>
                <DialogDescription>{{ t('settings.channels.edit.description') }}</DialogDescription>
            </DialogHeader>

            <form class="space-y-4" @submit.prevent="submitEditChannel">
                <div class="grid gap-2">
                    <Label for="ctx-ech-name">{{ t('settings.channels.edit.name') }}</Label>
                    <Input id="ctx-ech-name" v-model="editChannelForm.name" />
                    <p v-if="editChannelErrors.name" class="text-destructive text-sm">
                        {{ editChannelErrors.name }}
                    </p>
                </div>

                <div class="grid gap-2">
                    <Label for="ctx-ech-topic">{{ t('settings.channels.edit.topic') }}</Label>
                    <Input id="ctx-ech-topic" v-model="editChannelForm.topic" />
                </div>

                <div class="flex items-center gap-2">
                    <Checkbox
                        id="ctx-ech-private"
                        :model-value="editChannelForm.is_private"
                        @update:model-value="editChannelForm.is_private = !!$event"
                    />
                    <Label for="ctx-ech-private" class="text-sm">{{ t('settings.channels.edit.privateLabel') }}</Label>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" @click="showEditChannelDialog = false">{{
                        t('settings.common.cancel')
                    }}</Button>
                    <Button type="submit" :disabled="editingChannel">{{ t('settings.channels.edit.submit') }}</Button>
                </DialogFooter>
            </form>
        </DialogContent>
    </Dialog>

    <Dialog v-model:open="showDeleteChannelDialog">
        <DialogContent class="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>{{ t('settings.channels.delete.title') }}</DialogTitle>
                <DialogDescription>
                    {{ t('settings.channels.delete.description', { name: deletingChannelName }) }}
                </DialogDescription>
            </DialogHeader>
            <DialogFooter>
                <Button variant="outline" @click="showDeleteChannelDialog = false">{{
                    t('settings.common.cancel')
                }}</Button>
                <Button variant="destructive" :disabled="deletingChannel" @click="confirmDeleteChannel">{{
                    t('settings.channels.delete.submit')
                }}</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
