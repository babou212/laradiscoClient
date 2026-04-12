<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVoiceStore } from '@/stores/voice';
import { type ScreenShareQualityPreset } from '@/stores/voice';

const { t } = useI18n();
const voiceStore = useVoiceStore();

onMounted(async () => {
    await voiceStore.loadSettings();
});

const screenShareQualityOptions = computed<
    { value: ScreenShareQualityPreset; label: string; description: string }[]
>(() => [
    {
        value: 'low',
        label: t('settings.screenShare.presets.low'),
        description: t('settings.screenShare.presets.lowDescription'),
    },
    {
        value: 'medium',
        label: t('settings.screenShare.presets.medium'),
        description: t('settings.screenShare.presets.mediumDescription'),
    },
    {
        value: 'high',
        label: t('settings.screenShare.presets.high'),
        description: t('settings.screenShare.presets.highDescription'),
    },
    {
        value: 'source',
        label: t('settings.screenShare.presets.source'),
        description: t('settings.screenShare.presets.sourceDescription'),
    },
]);
</script>

<template>
    <div class="space-y-6">
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">{{ t('settings.screenShare.title') }}</h2>
                <p class="text-muted-foreground mt-1 text-sm">
                    {{ t('settings.screenShare.description') }}
                </p>
            </div>
            <div class="p-6">
                <label class="mb-2 block text-sm font-medium">{{ t('settings.screenShare.label') }}</label>
                <Select
                    :model-value="voiceStore.screenShareQuality"
                    @update:model-value="
                        (val) =>
                            typeof val === 'string' && voiceStore.setScreenShareQuality(val as ScreenShareQualityPreset)
                    "
                >
                    <SelectTrigger>
                        <SelectValue :placeholder="t('settings.screenShare.placeholder')" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem
                            v-for="option in screenShareQualityOptions"
                            :key="option.value"
                            :value="option.value"
                        >
                            {{ option.label }}
                        </SelectItem>
                    </SelectContent>
                </Select>
                <p class="text-muted-foreground mt-2 text-xs">
                    {{
                        screenShareQualityOptions.find((o) => o.value === voiceStore.screenShareQuality)?.description ??
                        ''
                    }}
                </p>
            </div>
        </div>
    </div>
</template>
