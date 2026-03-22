<script setup lang="ts">
import { onMounted } from 'vue';
import { useVoiceStore } from '@/stores/voice';
import { type ScreenShareQualityPreset } from '@/stores/voice';

const voiceStore = useVoiceStore();

onMounted(async () => {
    await voiceStore.loadSettings();
});

const screenShareQualityOptions: { value: ScreenShareQualityPreset; label: string; description: string }[] = [
    { value: 'low', label: '720p / 30 FPS', description: 'Lower bandwidth usage' },
    { value: 'medium', label: '1080p / 30 FPS', description: 'Balanced quality' },
    { value: 'high', label: '1080p / 60 FPS', description: 'Smooth high quality' },
    { value: 'source', label: 'Source / 60 FPS', description: 'Native resolution, highest quality' },
];

function onScreenShareQualityChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    voiceStore.setScreenShareQuality(target.value as ScreenShareQualityPreset);
}
</script>

<template>
    <div class="space-y-6">
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">Screen Share Quality</h2>
                <p class="text-muted-foreground mt-1 text-sm">
                    Choose the quality preset for when you share your screen.
                </p>
            </div>
            <div class="p-6">
                <label for="screen-share-quality" class="mb-2 block text-sm font-medium"> Quality Preset </label>
                <select
                    id="screen-share-quality"
                    class="border-input bg-background focus:border-ring focus:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-1 focus:outline-none"
                    :value="voiceStore.screenShareQuality"
                    @change="onScreenShareQualityChange"
                >
                    <option v-for="option in screenShareQualityOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                    </option>
                </select>
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
