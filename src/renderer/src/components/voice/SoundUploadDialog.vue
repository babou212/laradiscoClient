<script setup lang="ts">
import { onBeforeUnmount, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/plugins/regions';
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
import { useSoundboardStore } from '@/stores/soundboard';

const MAX_SECONDS = 20;
// Slack added to the region's maxLength so a full-length (10s) selection can
// still be dragged without the move being rejected at the floating-point boundary.
const DRAG_HEADROOM = 0.1;

const { t } = useI18n();
const soundboard = useSoundboardStore();

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: 'update:open', value: boolean): void }>();

const fileInput = ref<HTMLInputElement | null>(null);
const waveContainer = ref<HTMLDivElement | null>(null);

const file = ref<File | null>(null);
const name = ref('');
const regionStart = ref(0);
const regionEnd = ref(0);
const isPlaying = ref(false);
const isProcessing = ref(false);
const errorMsg = ref<string | null>(null);

let ws: WaveSurfer | null = null;
let objectUrl: string | null = null;

function destroyWave(): void {
    if (ws) {
        ws.destroy();
        ws = null;
    }
    if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
    }
    isPlaying.value = false;
}

function reset(): void {
    destroyWave();
    file.value = null;
    name.value = '';
    regionStart.value = 0;
    regionEnd.value = 0;
    isProcessing.value = false;
    errorMsg.value = null;
}

function triggerFileSelect(): void {
    fileInput.value?.click();
}

async function onFileSelect(event: Event): Promise<void> {
    const target = event.target as HTMLInputElement;
    const selected = target.files?.[0];
    target.value = '';
    if (!selected) return;

    file.value = selected;
    name.value = selected.name.replace(/\.[^/.]+$/, '');
    errorMsg.value = null;

    await nextTick();
    await initWave(selected);
}

async function initWave(audioFile: File): Promise<void> {
    destroyWave();
    await nextTick();
    if (!waveContainer.value) return;

    objectUrl = URL.createObjectURL(audioFile);
    const regions = RegionsPlugin.create();

    ws = WaveSurfer.create({
        container: waveContainer.value,
        height: 96,
        waveColor: 'rgba(139, 92, 246, 0.45)',
        progressColor: 'rgba(139, 92, 246, 0.9)',
        cursorColor: '#ffffff',
        url: objectUrl,
        plugins: [regions],
    });

    ws.on('decode', (duration: number) => {
        const end = Math.min(duration, MAX_SECONDS);
        regionStart.value = 0;
        regionEnd.value = end;
        regions.addRegion({
            start: 0,
            end,
            color: 'rgba(139, 92, 246, 0.2)',
            drag: true,
            resize: true,
            minLength: 0.2,
            // A bit of headroom above MAX_SECONDS: the default window is exactly
            // MAX_SECONDS long, and the plugin rejects a drag whenever the moved
            // length would exceed maxLength. Without slack, floating-point error
            // pushes the recomputed length just over 10s and the body won't drag.
            // The true 10s cap is enforced in save().
            maxLength: MAX_SECONDS + DRAG_HEADROOM,
        });
    });

    regions.on('region-updated', (region) => {
        regionStart.value = region.start;
        regionEnd.value = region.end;
    });

    // Stop preview playback when it runs past the selected region.
    ws.on('timeupdate', (time: number) => {
        if (isPlaying.value && time >= regionEnd.value) {
            ws?.pause();
            isPlaying.value = false;
        }
    });
    ws.on('finish', () => {
        isPlaying.value = false;
    });
}

function togglePreview(): void {
    if (!ws) return;
    if (isPlaying.value) {
        ws.pause();
        isPlaying.value = false;
        return;
    }
    ws.setTime(regionStart.value);
    void ws.play();
    isPlaying.value = true;
}

async function save(): Promise<void> {
    if (!file.value) return;
    isProcessing.value = true;
    errorMsg.value = null;

    try {
        const buffer = new Uint8Array(await file.value.arrayBuffer());
        // Enforce the hard 10s cap here (the region's maxLength carries a little
        // slack so a full-length window stays draggable).
        const end = Math.min(regionEnd.value, regionStart.value + MAX_SECONDS);
        const { data, mimeType } = await window.api.soundboard.trim(buffer, regionStart.value, end);
        // Copy into a fresh ArrayBuffer-backed view so it satisfies BlobPart.
        const blob = new Blob([new Uint8Array(data)], { type: mimeType });
        const finalName = (name.value.trim() || file.value.name.replace(/\.[^/.]+$/, '')).slice(0, 100);

        await soundboard.upload(finalName, blob, 'clip.ogg');
        emit('update:open', false);
    } catch {
        errorMsg.value = t('chat.voice.soundboard.upload.uploadError');
    } finally {
        isProcessing.value = false;
    }
}

watch(
    () => props.open,
    (open) => {
        if (!open) reset();
    },
);

onBeforeUnmount(reset);

const selectionSeconds = () => Math.max(0, regionEnd.value - regionStart.value).toFixed(1);
</script>

<template>
    <Dialog :open="open" @update:open="emit('update:open', $event)">
        <DialogContent class="max-w-lg">
            <DialogHeader>
                <DialogTitle>{{ t('chat.voice.soundboard.upload.title') }}</DialogTitle>
                <DialogDescription>{{ t('chat.voice.soundboard.upload.description') }}</DialogDescription>
            </DialogHeader>

            <input ref="fileInput" type="file" accept="audio/*" class="hidden" @change="onFileSelect" />

            <div v-if="!file" class="flex flex-col items-center justify-center gap-4 py-12">
                <p class="text-muted-foreground text-sm">{{ t('chat.voice.soundboard.upload.selectPrompt') }}</p>
                <Button @click="triggerFileSelect">{{ t('chat.voice.soundboard.upload.chooseFile') }}</Button>
            </div>

            <div v-else class="space-y-4">
                <div class="space-y-1.5">
                    <label class="text-muted-foreground text-xs font-medium">
                        {{ t('chat.voice.soundboard.upload.name') }}
                    </label>
                    <Input
                        v-model="name"
                        :placeholder="t('chat.voice.soundboard.upload.namePlaceholder')"
                        maxlength="100"
                    />
                </div>

                <div class="bg-muted/40 rounded-lg p-3">
                    <div ref="waveContainer" class="sb-wave min-h-[96px] w-full"></div>
                </div>

                <div class="flex items-center justify-between gap-2">
                    <p class="text-muted-foreground text-xs">
                        {{ t('chat.voice.soundboard.upload.trimHint') }}
                    </p>
                    <span class="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {{ t('chat.voice.soundboard.upload.selection', { duration: selectionSeconds() }) }}
                    </span>
                </div>

                <div class="flex items-center gap-2">
                    <Button variant="outline" size="sm" @click="togglePreview">
                        {{
                            isPlaying
                                ? t('chat.voice.soundboard.upload.stop')
                                : t('chat.voice.soundboard.upload.preview')
                        }}
                    </Button>
                    <Button variant="ghost" size="sm" @click="triggerFileSelect">
                        {{ t('chat.voice.soundboard.upload.chooseDifferent') }}
                    </Button>
                </div>

                <p v-if="errorMsg" class="text-destructive text-xs">{{ errorMsg }}</p>
            </div>

            <DialogFooter>
                <Button variant="outline" @click="emit('update:open', false)">{{ t('common.cancel') }}</Button>
                <Button v-if="file" :disabled="isProcessing" @click="save">
                    {{
                        isProcessing
                            ? t('chat.voice.soundboard.upload.processing')
                            : t('chat.voice.soundboard.upload.save')
                    }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>

<!--
    Not scoped on purpose: WaveSurfer renders the region + its resize handles inside a
    shadow root, so the trim handles can only be reached through ::part().

    Two things matter here:
    1. The plugin's default handles are a 2px rgba(0,0,0,0.5) line, invisible on our
       dark theme. We give them a bright, visible grip.
    2. The handles sit INSIDE the region at its edges, so on a narrow selection two
       fat handles cover the whole box and there's no body left to grab/drag. We keep
       them thin and pull them outward (negative margin) so they straddle the edges,
       always leaving a draggable body in the middle.
-->
<style>
.sb-wave > div::part(region-handle) {
    width: 6px !important;
    background-color: rgba(255, 255, 255, 0.55) !important;
    transition: background-color 0.15s ease;
}
.sb-wave > div::part(region-handle):hover {
    background-color: rgba(255, 255, 255, 0.85) !important;
}
.sb-wave > div::part(region-handle-left) {
    margin-left: -3px !important;
    border-radius: 3px !important;
}
.sb-wave > div::part(region-handle-right) {
    margin-right: -3px !important;
    border-radius: 3px !important;
}
</style>
