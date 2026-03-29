<script setup lang="ts">
import { Download, Film, Loader2, Pause, Play, Volume2, VolumeX } from 'lucide-vue-next';
import { computed, nextTick, onBeforeUnmount, shallowRef, useTemplateRef } from 'vue';
import { Slider } from '@/components/ui/slider';
import api from '@/lib/api';
import { decryptAttachment } from '@/lib/decrypt-attachment';
import type { EncryptedAttachmentMeta } from '@/types/chat';

const props = defineProps<{
    attachment: EncryptedAttachmentMeta;
}>();

const videoRef = useTemplateRef<HTMLVideoElement>('videoRef');
const blobUrl = shallowRef<string | null>(null);
const thumbnailUrl = shallowRef<string | null>(props.attachment.thumbnail_data_url ?? null);
const thumbnailLoading = shallowRef(false);
const isLoading = shallowRef(false);
const isBuffering = shallowRef(false);
const videoReady = shallowRef(false);
const loadError = shallowRef(false);
const isPlaying = shallowRef(false);
const isPaused = computed(() => !isPlaying.value);
const retryCount = shallowRef(0);
let isMounted = true;
const duration = shallowRef(0);
const currentTime = shallowRef(0);
const volume = shallowRef(0.8);
const isMuted = shallowRef(false);
const isSeeking = shallowRef(false);
const controlsVisible = shallowRef(true);
const playbackRate = shallowRef(1);
const showSpeedMenu = shallowRef(false);

let controlsTimer: ReturnType<typeof setTimeout> | undefined;
let animationFrameId: number | null = null;

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const progress = computed(() => {
    if (duration.value <= 0) return 0;
    return (currentTime.value / duration.value) * 100;
});

const seekValue = computed(() => [progress.value]);
const thumbnailContainerStyle = computed(() => {
    if (blobUrl.value) return {};
    if (props.attachment.thumbnail_width && props.attachment.thumbnail_height) {
        return {
            aspectRatio: `${props.attachment.thumbnail_width}/${props.attachment.thumbnail_height}`,
            maxHeight: '320px',
            minWidth: '240px',
        };
    }
    return { height: '180px', minWidth: '240px' };
});
const volumePercent = computed(() => {
    if (isMuted.value) return [0];
    return [Math.round(volume.value * 100)];
});

function formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function decryptVideo(): Promise<string> {
    const response = await api.get(`/attachments/${props.attachment.id}/download`);
    const { download_url } = response.data;

    return window.api.attachments.prepareVideo({
        attachmentId: props.attachment.id,
        downloadUrl: download_url,
        key: props.attachment.key,
        iv: props.attachment.iv,
        mimeType: props.attachment.mime_type,
    });
}

function onThumbnailError() {
    if (thumbnailUrl.value) {
        thumbnailUrl.value = null;
        loadThumbnail();
    }
}

async function loadThumbnail() {
    if (!props.attachment.thumbnail_key || thumbnailLoading.value || thumbnailUrl.value) return;
    thumbnailLoading.value = true;

    try {
        const response = await api.get(`/attachments/${props.attachment.id}/download`);
        const { thumbnail_url } = response.data;
        if (!thumbnail_url) return;

        const encryptedBuffer = await window.api.attachments.downloadBuffer(thumbnail_url);

        const decryptedBuffer = await decryptAttachment(
            encryptedBuffer,
            props.attachment.thumbnail_key!,
            props.attachment.thumbnail_iv!,
        );
        const blob = new Blob([decryptedBuffer], { type: 'image/webp' });
        thumbnailUrl.value = URL.createObjectURL(blob);
    } catch (err) {
        console.error('Failed to load video thumbnail:', err);
    } finally {
        thumbnailLoading.value = false;
    }
}

function startTimeTracking() {
    const update = () => {
        if (videoRef.value && isPlaying.value && !isSeeking.value) {
            currentTime.value = videoRef.value.currentTime;
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

function showControls() {
    controlsVisible.value = true;
    clearTimeout(controlsTimer);
    if (isPlaying.value) {
        controlsTimer = setTimeout(() => {
            controlsVisible.value = false;
            showSpeedMenu.value = false;
        }, 3000);
    }
}

function onMouseMove() {
    showControls();
}

function onMouseLeave() {
    if (isPlaying.value) {
        controlsTimer = setTimeout(() => {
            controlsVisible.value = false;
            showSpeedMenu.value = false;
        }, 1000);
    }
}

async function loadAndPlay() {
    if (isLoading.value) return;
    isLoading.value = true;
    isBuffering.value = true;
    loadError.value = false;

    try {
        const url = await decryptVideo();
        if (!isMounted) {
            window.api.attachments.cleanupVideo(props.attachment.id).catch(() => {});
            return;
        }
        blobUrl.value = url;
        await nextTick();
        videoRef.value?.load();
    } catch (err) {
        if (!isMounted) return;
        console.error('Failed to load video:', err);
        loadError.value = true;
        isLoading.value = false;
        isBuffering.value = false;
    }
}

function onVideoLoaded() {
    isLoading.value = false;
    isBuffering.value = false;
    videoReady.value = true;
    if (videoRef.value) {
        duration.value = videoRef.value.duration;
        videoRef.value.volume = volume.value;
        videoRef.value.playbackRate = playbackRate.value;
        videoRef.value.play().catch(() => {
            // Autoplay blocked — user can click play manually
        });
    }
}

function togglePlayPause() {
    if (!blobUrl.value) {
        loadAndPlay();
        return;
    }

    if (!videoRef.value) return;

    if (isPlaying.value) {
        videoRef.value.pause();
    } else {
        videoRef.value.play();
    }
}

function onPlay() {
    isPlaying.value = true;
    startTimeTracking();
    showControls();
}

function onPause() {
    isPlaying.value = false;
    stopTimeTracking();
    controlsVisible.value = true;
    clearTimeout(controlsTimer);
}

function onEnded() {
    isPlaying.value = false;
    currentTime.value = 0;
    stopTimeTracking();
    controlsVisible.value = true;
    clearTimeout(controlsTimer);
}

function onVideoError() {
    const err = videoRef.value?.error;
    if (err) {
        console.error('Video element error:', err.code, err.message);
    }

    // Attempt one silent recovery: purge the cache entry and let the user click play again.
    if (retryCount.value < 1 && blobUrl.value) {
        retryCount.value++;
        window.api.attachments.cleanupVideo(props.attachment.id).catch(() => {});
        blobUrl.value = null;
        videoReady.value = false;
        isLoading.value = false;
        isBuffering.value = false;
        isPlaying.value = false;
        return;
    }

    loadError.value = true;
    isLoading.value = false;
    isBuffering.value = false;
    videoReady.value = false;
}

function onSeekUpdate(val: number[] | undefined) {
    if (!val) return;
    currentTime.value = (val[0] / 100) * duration.value;
}

function onSeekStart() {
    isSeeking.value = true;
}

function onSeekCommit(val: number[]) {
    const seekTo = (val[0] / 100) * duration.value;
    if (videoRef.value) {
        videoRef.value.currentTime = seekTo;
    }
    currentTime.value = seekTo;
    isSeeking.value = false;
}

function onVolumeUpdate(val: number[] | undefined) {
    if (!val) return;
    volume.value = val[0] / 100;
    if (videoRef.value) {
        videoRef.value.volume = volume.value;
    }
    if (volume.value > 0) {
        isMuted.value = false;
    }
}

function toggleMute() {
    isMuted.value = !isMuted.value;
    if (videoRef.value) {
        videoRef.value.muted = isMuted.value;
    }
}

function setSpeed(speed: number) {
    playbackRate.value = speed;
    if (videoRef.value) {
        videoRef.value.playbackRate = speed;
    }
    showSpeedMenu.value = false;
}

async function downloadFile() {
    try {
        const sourceUrl = blobUrl.value ?? (await decryptVideo());
        let tempBlobUrl: string | null = null;
        let downloadUrl: string;

        if (sourceUrl.startsWith('app-video://')) {
            const response = await fetch(sourceUrl);
            const blob = await response.blob();
            tempBlobUrl = URL.createObjectURL(blob);
            downloadUrl = tempBlobUrl;
        } else {
            downloadUrl = sourceUrl;
        }

        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = props.attachment.file_name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        if (tempBlobUrl) {
            URL.revokeObjectURL(tempBlobUrl);
        } else if (!blobUrl.value) {
            await window.api.attachments.cleanupVideo(props.attachment.id);
        }
    } catch (err) {
        console.error('Failed to download video:', err);
    }
}

function cleanup() {
    isMounted = false;
    stopTimeTracking();
    clearTimeout(controlsTimer);
    if (blobUrl.value) {
        window.api.attachments.cleanupVideo(props.attachment.id).catch(() => {});
        blobUrl.value = null;
    }
    if (thumbnailUrl.value && thumbnailUrl.value.startsWith('blob:')) {
        const url = thumbnailUrl.value;
        thumbnailUrl.value = null;
        URL.revokeObjectURL(url);
    }
}

if (props.attachment.thumbnail_key) {
    loadThumbnail();
}

onBeforeUnmount(cleanup);
</script>

<template>
    <div class="inline-block max-w-sm">
        <div v-if="loadError" class="bg-muted flex items-center gap-3 rounded-lg p-3">
            <div class="bg-accent text-muted-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded">
                <Film :size="18" />
            </div>
            <div class="min-w-0 flex-1">
                <div class="text-foreground truncate text-sm font-medium">{{ attachment.file_name }}</div>
                <div class="text-destructive text-xs">Failed to load video</div>
            </div>
            <button
                class="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                title="Download"
                @click="downloadFile"
            >
                <Download :size="16" />
            </button>
        </div>

        <div
            v-else
            class="group relative overflow-hidden rounded-lg bg-black"
            :class="{ 'cursor-none': !controlsVisible && isPlaying }"
            @mousemove="onMouseMove"
            @mouseleave="onMouseLeave"
        >
            <div
                v-if="!videoReady || !isPlaying"
                class="relative flex items-center justify-center"
                :class="{ 'absolute inset-0 z-10': blobUrl }"
                :style="thumbnailContainerStyle"
            >
                <img
                    v-if="thumbnailUrl && !blobUrl"
                    :src="thumbnailUrl"
                    :alt="attachment.file_name"
                    class="h-full w-full object-cover"
                    @error="onThumbnailError"
                />
                <div v-else-if="!blobUrl" class="bg-accent/50 absolute inset-0 flex items-center justify-center">
                    <Film :size="32" class="text-muted-foreground" />
                </div>

                <button
                    v-if="!isPlaying && !videoReady"
                    class="absolute inset-0 z-20 flex items-center justify-center transition-colors hover:bg-black/20"
                    @click="blobUrl ? togglePlayPause() : loadAndPlay()"
                >
                    <div
                        v-if="isLoading"
                        class="flex h-14 w-14 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm"
                    >
                        <Loader2 :size="28" class="animate-spin text-white" />
                    </div>
                    <div
                        v-else
                        class="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition-transform hover:scale-110"
                    >
                        <Play :size="28" class="ml-1 text-white" fill="white" />
                    </div>
                </button>
            </div>

            <video
                v-if="blobUrl"
                ref="videoRef"
                class="max-h-[70vh] w-full"
                :src="blobUrl"
                preload="auto"
                playsinline
                @canplay="onVideoLoaded"
                @play="onPlay"
                @pause="onPause"
                @ended="onEnded"
                @error="onVideoError"
                @click="togglePlayPause"
            />

            <div
                v-if="blobUrl && isBuffering"
                class="absolute inset-0 z-20 flex items-center justify-center bg-black/40"
            >
                <Loader2 :size="32" class="animate-spin text-white" />
            </div>

            <div
                v-if="blobUrl"
                class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pt-8 pb-2 transition-opacity duration-300"
                :class="controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'"
            >
                <div class="mb-2">
                    <Slider
                        :model-value="seekValue"
                        :min="0"
                        :max="100"
                        :step="0.1"
                        class="video-seek w-full"
                        @update:model-value="onSeekUpdate"
                        @pointerdown="onSeekStart"
                        @value-commit="onSeekCommit"
                    />
                </div>

                <div class="flex items-center gap-1">
                    <button
                        class="flex h-8 w-8 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20"
                        @click.stop="togglePlayPause"
                    >
                        <Pause v-if="isPlaying" :size="18" />
                        <Play v-else :size="18" />
                    </button>

                    <button
                        class="flex h-8 w-8 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20"
                        @click.stop="toggleMute"
                    >
                        <VolumeX v-if="isMuted || volume === 0" :size="16" />
                        <Volume2 v-else :size="16" />
                    </button>
                    <div class="w-20">
                        <Slider
                            :model-value="volumePercent"
                            :min="0"
                            :max="100"
                            :step="1"
                            class="video-volume"
                            @update:model-value="onVolumeUpdate"
                        />
                    </div>

                    <span class="ml-1 text-[11px] text-white/80 tabular-nums">
                        {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
                    </span>

                    <div class="flex-1" />

                    <div class="relative">
                        <button
                            class="flex h-8 items-center justify-center rounded-full px-2 text-[11px] font-medium text-white transition-colors hover:bg-white/20"
                            @click.stop="showSpeedMenu = !showSpeedMenu"
                        >
                            {{ playbackRate }}x
                        </button>
                        <div
                            v-if="showSpeedMenu"
                            class="absolute right-0 bottom-full mb-1 rounded-lg bg-black/90 py-1 backdrop-blur-sm"
                        >
                            <button
                                v-for="speed in PLAYBACK_SPEEDS"
                                :key="speed"
                                class="flex w-full px-4 py-1.5 text-left text-[11px] text-white transition-colors hover:bg-white/20"
                                :class="{ 'text-primary font-bold': speed === playbackRate }"
                                @click.stop="setSpeed(speed)"
                            >
                                {{ speed }}x
                            </button>
                        </div>
                    </div>

                    <button
                        class="flex h-8 w-8 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20"
                        title="Download"
                        @click.stop="downloadFile"
                    >
                        <Download :size="16" />
                    </button>
                </div>
            </div>

            <Transition name="fade">
                <button
                    v-if="blobUrl && videoReady && isPaused && !isBuffering"
                    class="absolute inset-0 z-10 flex items-center justify-center"
                    @click="togglePlayPause"
                >
                    <div
                        class="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm transition-transform hover:scale-110"
                    >
                        <Play :size="28" class="ml-1 text-white" fill="white" />
                    </div>
                </button>
            </Transition>
        </div>

        <div class="text-muted-foreground mt-1 flex items-center gap-1 text-[10px]">
            <span class="truncate">{{ attachment.file_name }}</span>
            <span class="shrink-0">{{ formatFileSize(attachment.size) }}</span>
        </div>
    </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
