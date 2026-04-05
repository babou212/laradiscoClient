<script setup lang="ts">
import { Howl } from 'howler';
import { Download, Loader2, Music, Pause, Play, Volume2, VolumeX } from 'lucide-vue-next';
import { computed, onBeforeUnmount, shallowRef } from 'vue';
import { getAttachmentDownloadUrl } from '@/api/attachments';
import { Slider } from '@/components/ui/slider';
import { decryptAttachment } from '@/lib/decrypt-attachment';
import type { EncryptedAttachmentMeta } from '@/types/chat';

const props = defineProps<{
    attachment: EncryptedAttachmentMeta;
}>();

const howl = shallowRef<Howl | null>(null);
const blobUrl = shallowRef<string | null>(null);
const isPlaying = shallowRef(false);
const isLoading = shallowRef(false);
const loadError = shallowRef(false);
const duration = shallowRef(0);
const currentTime = shallowRef(0);
const volume = shallowRef(0.8);
const isMuted = shallowRef(false);
const isSeeking = shallowRef(false);

let animationFrameId: number | null = null;

const mimeToFormat: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/ogg': 'ogg',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/wave': 'wav',
    'audio/flac': 'flac',
    'audio/x-flac': 'flac',
    'audio/aac': 'aac',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/m4a': 'm4a',
    'audio/webm': 'webm',
    'audio/opus': 'opus',
};

const format = computed(() => {
    return mimeToFormat[props.attachment.mime_type] ?? props.attachment.mime_type.replace('audio/', '');
});

const progress = computed(() => {
    if (duration.value <= 0) return 0;
    return (currentTime.value / duration.value) * 100;
});

function formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function startTimeTracking() {
    const update = () => {
        if (howl.value && isPlaying.value && !isSeeking.value) {
            currentTime.value = howl.value.seek() as number;
        }
        animationFrameId = requestAnimationFrame(update);
    };
    animationFrameId = requestAnimationFrame(update);
}

function stopTimeTracking() {
    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

async function decryptAudio(): Promise<string> {
    const { download_url } = await getAttachmentDownloadUrl(props.attachment.id);

    const encryptedBuffer = await window.api.attachments.downloadBuffer(download_url);

    const decryptedBuffer = await decryptAttachment(encryptedBuffer, props.attachment.key, props.attachment.iv);
    const blob = new Blob([decryptedBuffer], { type: props.attachment.mime_type });
    return URL.createObjectURL(blob);
}

async function loadAndPlay() {
    if (isLoading.value) return;

    if (howl.value) {
        howl.value.play();
        return;
    }

    isLoading.value = true;
    loadError.value = false;

    try {
        blobUrl.value = await decryptAudio();

        howl.value = new Howl({
            src: [blobUrl.value],
            html5: true,
            format: [format.value],
            volume: volume.value,
            onplay: () => {
                isPlaying.value = true;
                duration.value = howl.value?.duration() ?? 0;
                startTimeTracking();
            },
            onpause: () => {
                isPlaying.value = false;
                stopTimeTracking();
            },
            onstop: () => {
                isPlaying.value = false;
                currentTime.value = 0;
                stopTimeTracking();
            },
            onend: () => {
                isPlaying.value = false;
                currentTime.value = 0;
                stopTimeTracking();
            },
            onload: () => {
                duration.value = howl.value?.duration() ?? 0;
            },
            onloaderror: (_id, err) => {
                console.error('Audio load error:', err);
                loadError.value = true;
                cleanup();
            },
            onplayerror: (_id, err) => {
                console.error('Audio play error:', err);
                loadError.value = true;
            },
        });

        howl.value.play();
    } catch (err) {
        console.error('Failed to load audio:', err);
        loadError.value = true;
    } finally {
        isLoading.value = false;
    }
}

function togglePlayPause() {
    if (!howl.value) {
        loadAndPlay();
        return;
    }

    if (isPlaying.value) {
        howl.value.pause();
    } else {
        howl.value.play();
    }
}

const volumePercent = computed(() => {
    if (isMuted.value) return [0];
    return [Math.round(volume.value * 100)];
});

const seekValue = computed(() => [progress.value]);

function onSeekUpdate(val: number[] | undefined) {
    if (!val) return;
    currentTime.value = (val[0] / 100) * duration.value;
}

function onSeekStart() {
    isSeeking.value = true;
}

function onSeekCommit(val: number[]) {
    const seekTo = (val[0] / 100) * duration.value;
    if (howl.value) {
        howl.value.seek(seekTo);
    }
    currentTime.value = seekTo;
    isSeeking.value = false;
}

function onVolumeUpdate(val: number[] | undefined) {
    if (!val) return;
    volume.value = val[0] / 100;
    if (howl.value) {
        howl.value.volume(volume.value);
    }
    if (volume.value > 0) {
        isMuted.value = false;
    }
}

function toggleMute() {
    isMuted.value = !isMuted.value;
    if (howl.value) {
        howl.value.mute(isMuted.value);
    }
}

async function downloadFile() {
    try {
        const url = blobUrl.value ?? (await decryptAudio());
        const a = document.createElement('a');
        a.href = url;
        a.download = props.attachment.file_name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        if (!blobUrl.value) {
            URL.revokeObjectURL(url);
        }
    } catch (err) {
        console.error('Failed to download audio:', err);
    }
}

function cleanup() {
    stopTimeTracking();
    if (howl.value) {
        howl.value.unload();
        howl.value = null;
    }
    if (blobUrl.value) {
        URL.revokeObjectURL(blobUrl.value);
        blobUrl.value = null;
    }
}

onBeforeUnmount(cleanup);
</script>

<template>
    <div class="bg-muted w-72 rounded-lg p-3">
        <!-- Error fallback: show download button -->
        <div v-if="loadError" class="flex items-center gap-3">
            <div class="bg-accent text-muted-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded">
                <Music :size="18" />
            </div>
            <div class="min-w-0 flex-1">
                <div class="text-foreground truncate text-sm font-medium">{{ attachment.file_name }}</div>
                <div class="text-destructive text-xs">Failed to load audio</div>
            </div>
            <button
                class="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                title="Download"
                @click="downloadFile"
            >
                <Download :size="16" />
            </button>
        </div>

        <!-- Audio player -->
        <div v-else>
            <!-- Top row: icon, file info, download -->
            <div class="mb-2 flex items-center gap-2">
                <div class="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                    <Music :size="16" />
                </div>
                <div class="min-w-0 flex-1">
                    <div class="text-foreground truncate text-xs font-medium">
                        {{ attachment.file_name }}
                    </div>
                    <div class="text-muted-foreground text-[10px]">
                        {{ formatFileSize(attachment.size) }}
                    </div>
                </div>
                <button
                    class="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                    title="Download"
                    @click="downloadFile"
                >
                    <Download :size="14" />
                </button>
            </div>

            <!-- Controls row: play/pause, seek bar, time -->
            <div class="flex items-center gap-2">
                <button
                    class="text-foreground hover:text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors"
                    :disabled="isLoading"
                    @click="togglePlayPause"
                >
                    <Loader2 v-if="isLoading" :size="18" class="animate-spin" />
                    <Pause v-else-if="isPlaying" :size="18" />
                    <Play v-else :size="18" />
                </button>

                <div class="flex min-w-0 flex-1 items-center gap-2">
                    <Slider
                        :model-value="seekValue"
                        :min="0"
                        :max="100"
                        :step="0.1"
                        :disabled="!howl"
                        class="audio-seek w-full"
                        @update:model-value="onSeekUpdate"
                        @pointerdown="onSeekStart"
                        @value-commit="onSeekCommit"
                    />
                </div>

                <span class="text-muted-foreground w-[70px] shrink-0 text-right text-[10px] tabular-nums">
                    {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
                </span>
            </div>

            <!-- Volume row -->
            <div class="mt-1 flex items-center gap-1.5 pl-8">
                <button
                    class="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                    @click="toggleMute"
                >
                    <VolumeX v-if="isMuted || volume === 0" :size="12" />
                    <Volume2 v-else :size="12" />
                </button>
                <Slider
                    :model-value="volumePercent"
                    :min="0"
                    :max="100"
                    :step="1"
                    class="audio-volume w-24"
                    @update:model-value="onVolumeUpdate"
                />
            </div>
        </div>
    </div>
</template>

<style scoped>
.audio-seek :deep([data-slot='slider-track']) {
    height: 6px;
}

.audio-seek :deep([data-slot='slider-range']) {
    background: hsl(var(--primary));
}

.audio-seek :deep([data-slot='slider-thumb']) {
    width: 14px;
    height: 14px;
    border-color: hsl(var(--primary));
    background: hsl(var(--primary));
    transition: transform 0.15s ease;
}

.audio-seek:hover :deep([data-slot='slider-thumb']) {
    transform: scale(1.2);
}

.audio-volume :deep([data-slot='slider-track']) {
    height: 4px;
}

.audio-volume :deep([data-slot='slider-range']) {
    background: hsl(var(--muted-foreground));
}

.audio-volume :deep([data-slot='slider-thumb']) {
    width: 12px;
    height: 12px;
    border-color: hsl(var(--muted-foreground));
    background: hsl(var(--muted-foreground));
    transition: transform 0.15s ease;
}

.audio-volume:hover :deep([data-slot='slider-thumb']) {
    transform: scale(1.2);
}
</style>
