<script setup lang="ts">
import { useMutation } from '@pinia/colada';
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { deleteServerLogo, updateServerSettings, uploadServerLogo } from '@/api/settings';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import AvatarCropDialog from '@/components/ui/AvatarCropDialog.vue';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useChatStore } from '@/stores/chat';
import { useServerStore } from '@/stores/server';

const { t } = useI18n();
const serverStore = useServerStore();
const chatStore = useChatStore();

const showLogoDialog = ref(false);
const logoSrc = ref<string | null>(null);
const logoResolving = ref(false);

const afkChannelId = ref<string>('');
const afkTimeout = ref<number>(5);
const settingsSaved = ref(false);

const voiceChannels = computed(() =>
    chatStore.categories.flatMap((cat) => cat.channels.filter((ch) => ch.type === 'voice')),
);

const serverInitials = computed(() => {
    const host = serverStore.activeHost ?? 'S';
    return host
        .replace(/^https?:\/\//, '')
        .charAt(0)
        .toUpperCase();
});

async function resolveLogoUrl(url: string): Promise<void> {
    if (!window.api?.avatar) {
        logoSrc.value = url;
        return;
    }
    logoResolving.value = true;
    try {
        const cached = await window.api.avatar.resolve('0', url);
        logoSrc.value = cached ?? url;
    } finally {
        logoResolving.value = false;
    }
}

onMounted(async () => {
    await serverStore.loadServerSettings();
    afkChannelId.value = serverStore.afkChannelId ? String(serverStore.afkChannelId) : 'none';
    afkTimeout.value = serverStore.afkTimeout ?? 5;
    const thumb = serverStore.serverLogoUrls?.thumb ?? serverStore.serverLogoUrls?.original ?? null;
    if (thumb) await resolveLogoUrl(thumb);
});

const { mutateAsync: doUploadLogo, isLoading: logoUploading } = useMutation({
    mutation: (blob: Blob) => uploadServerLogo(blob),
});

const { mutateAsync: doDeleteLogo, isLoading: logoDeleting } = useMutation({
    mutation: () => deleteServerLogo(),
});

const { mutateAsync: doUpdateSettings, isLoading: settingsSaving } = useMutation({
    mutation: (data: { afk_channel_id?: number | null; afk_timeout?: number }) => updateServerSettings(data),
});

async function onLogoSave(blob: Blob) {
    try {
        const result = await doUploadLogo(blob);
        serverStore.serverLogoUrls = result.logo_urls;
        const url = result.logo_urls?.thumb ?? result.logo_urls?.original ?? null;
        if (url) await resolveLogoUrl(url);
        showLogoDialog.value = false;
    } catch {
        // upload error — dialog stays open
    }
}

async function removeLogo() {
    await doDeleteLogo();
    serverStore.serverLogoUrls = null;
    logoSrc.value = null;
    void window.api?.avatar?.forget('0').catch(() => {});
}

async function saveAfkSettings() {
    const result = await doUpdateSettings({
        afk_channel_id: afkChannelId.value && afkChannelId.value !== 'none' ? Number(afkChannelId.value) : null,
        afk_timeout: afkTimeout.value,
    });
    serverStore.afkChannelId = result.afk_channel_id;
    serverStore.afkTimeout = result.afk_timeout;
    settingsSaved.value = true;
    setTimeout(() => (settingsSaved.value = false), 2000);
}
</script>

<template>
    <div class="space-y-6">
        <div>
            <h2 class="text-2xl font-bold">{{ t('settings.serverProfile.title') }}</h2>
            <p class="text-muted-foreground mt-1 text-sm">{{ t('settings.serverProfile.description') }}</p>
        </div>

        <!-- Server Icon -->
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h3 class="font-semibold">{{ t('settings.serverProfile.icon.title') }}</h3>
                <p class="text-muted-foreground mt-1 text-sm">
                    {{ t('settings.serverProfile.icon.description') }}
                </p>
            </div>
            <div class="px-6 py-5">
                <div class="flex items-center gap-6">
                    <Avatar class="size-20 rounded-xl text-2xl">
                        <AvatarImage v-if="logoSrc" :src="logoSrc" alt="Server logo" class="object-cover" />
                        <AvatarFallback class="bg-primary text-primary-foreground rounded-xl text-2xl font-bold">
                            {{ serverInitials }}
                        </AvatarFallback>
                    </Avatar>

                    <div class="space-y-2">
                        <div class="flex gap-2">
                            <Button size="sm" @click="showLogoDialog = true">
                                {{
                                    serverStore.serverLogoUrls
                                        ? t('settings.serverProfile.icon.change')
                                        : t('settings.serverProfile.icon.upload')
                                }}
                            </Button>
                            <Button
                                v-if="serverStore.serverLogoUrls"
                                size="sm"
                                variant="outline"
                                :disabled="logoDeleting"
                                @click="removeLogo"
                            >
                                {{ t('settings.serverProfile.icon.remove') }}
                            </Button>
                        </div>
                        <p class="text-muted-foreground text-xs">
                            {{ t('settings.serverProfile.icon.hint') }}
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <!-- AFK Channel -->
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h3 class="font-semibold">{{ t('settings.serverProfile.afk.title') }}</h3>
                <p class="text-muted-foreground mt-1 text-sm">
                    {{ t('settings.serverProfile.afk.description') }}
                </p>
            </div>
            <div class="space-y-4 px-6 py-5">
                <div class="grid gap-2">
                    <label class="text-sm font-medium">{{ t('settings.serverProfile.afk.channel') }}</label>
                    <Select v-model="afkChannelId">
                        <SelectTrigger class="w-72">
                            <SelectValue :placeholder="t('settings.serverProfile.afk.noChannel')" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="none">{{ t('settings.serverProfile.afk.noChannel') }}</SelectItem>
                            <SelectItem v-for="ch in voiceChannels" :key="ch.id" :value="ch.id">
                                {{ ch.name }}
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div class="grid gap-2">
                    <label class="text-sm font-medium">{{ t('settings.serverProfile.afk.timeout') }}</label>
                    <div class="flex items-center gap-3">
                        <Select :model-value="String(afkTimeout)" @update:model-value="afkTimeout = Number($event)">
                            <SelectTrigger class="w-40">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="1">1 {{ t('settings.serverProfile.afk.minute') }}</SelectItem>
                                <SelectItem value="5">5 {{ t('settings.serverProfile.afk.minutes') }}</SelectItem>
                                <SelectItem value="10">10 {{ t('settings.serverProfile.afk.minutes') }}</SelectItem>
                                <SelectItem value="15">15 {{ t('settings.serverProfile.afk.minutes') }}</SelectItem>
                                <SelectItem value="30">30 {{ t('settings.serverProfile.afk.minutes') }}</SelectItem>
                                <SelectItem value="60">60 {{ t('settings.serverProfile.afk.minutes') }}</SelectItem>
                            </SelectContent>
                        </Select>
                        <span class="text-muted-foreground text-sm">
                            {{ t('settings.serverProfile.afk.inactivity') }}
                        </span>
                    </div>
                </div>

                <div class="flex items-center gap-3">
                    <Button :disabled="settingsSaving" @click="saveAfkSettings">
                        {{ t('settings.common.save') }}
                    </Button>
                    <span v-if="settingsSaved" class="text-muted-foreground text-sm">
                        {{ t('settings.common.saved') }}
                    </span>
                </div>
            </div>
        </div>
    </div>

    <AvatarCropDialog v-model:open="showLogoDialog" @save="onLogoSave" />
</template>
