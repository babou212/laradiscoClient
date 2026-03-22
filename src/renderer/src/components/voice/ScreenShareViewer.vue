<script setup lang="ts">
import {
    Maximize2,
    Minimize2,
    X,
    ChevronLeft,
    ChevronRight,
    Monitor,
    Volume2,
    VolumeX,
    Fullscreen,
    PictureInPicture2,
} from 'lucide-vue-next';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useVoiceStore, type ScreenShareParticipant } from '@/stores/voice';

const voiceStore = useVoiceStore();

const isDragging = ref(false);
const position = ref({ x: -1, y: -1 });
const dragOffset = ref({ x: 0, y: 0 });
const videoRef = ref<HTMLVideoElement | null>(null);
const audioRef = ref<HTMLAudioElement | null>(null);

const PIP_WIDTH = 480;
const PIP_HEIGHT = 270;
const SNAP_MARGIN = 12;

const hasScreenShares = computed(() => voiceStore.screenShareParticipants.length > 0);

const activeParticipant = computed<ScreenShareParticipant | null>(() => {
    if (!voiceStore.activeScreenShareView) return null;
    return voiceStore.screenShareParticipants.find((s) => s.identity === voiceStore.activeScreenShareView) ?? null;
});

const activeIndex = computed(() => {
    if (!activeParticipant.value) return -1;
    return voiceStore.screenShareParticipants.findIndex((s) => s.identity === activeParticipant.value!.identity);
});

const hasMultiple = computed(() => voiceStore.screenShareParticipants.length > 1);

const isPip = computed(() => voiceStore.screenShareViewMode === 'pip');
const isChannel = computed(() => voiceStore.screenShareViewMode === 'channel');
const isFullscreen = computed(() => voiceStore.screenShareViewMode === 'fullscreen');

function snapPosition(x: number, y: number): { x: number; y: number } {
    const maxX = window.innerWidth - PIP_WIDTH;
    const maxY = window.innerHeight - PIP_HEIGHT;
    const centerX = maxX / 2;

    const snappedX = x < centerX ? SNAP_MARGIN : maxX - SNAP_MARGIN;

    let snappedY: number;
    if (y < maxY * 0.33) {
        snappedY = SNAP_MARGIN;
    } else if (y > maxY * 0.66) {
        snappedY = maxY - SNAP_MARGIN;
    } else {
        snappedY = Math.round((maxY - PIP_HEIGHT) / 2 + PIP_HEIGHT / 2);
    }

    return { x: snappedX, y: snappedY };
}

function ensurePosition() {
    if (position.value.x < 0) {
        position.value = {
            x: window.innerWidth - PIP_WIDTH - SNAP_MARGIN,
            y: window.innerHeight - PIP_HEIGHT - SNAP_MARGIN,
        };
    }
}

watch(
    [activeParticipant, videoRef],
    () => {
        const participant = activeParticipant.value;
        const video = videoRef.value;
        if (!participant || !video) return;

        const mediaTrack = participant.videoTrack.mediaStreamTrack;
        const stream = new MediaStream([mediaTrack]);
        video.srcObject = stream;
        video.play().catch(() => {});
    },
    { immediate: true },
);

watch(
    [activeParticipant, audioRef],
    () => {
        const participant = activeParticipant.value;
        const audio = audioRef.value;
        if (!audio) return;

        if (participant?.audioTrack) {
            const stream = new MediaStream([participant.audioTrack.mediaStreamTrack]);
            audio.srcObject = stream;
            audio.muted = voiceStore.screenShareAudioMuted;
            if (!voiceStore.screenShareAudioMuted) {
                audio.play().catch(() => {});
            }
        } else {
            audio.srcObject = null;
        }
    },
    { immediate: true },
);

watch(
    () => voiceStore.screenShareAudioMuted,
    (muted) => {
        const audio = audioRef.value;
        if (!audio) return;
        audio.muted = muted;
        if (!muted && audio.srcObject) {
            audio.play().catch(() => {});
        }
    },
);

watch(hasScreenShares, (val) => {
    if (val) {
        nextTick(() => ensurePosition());
    }
});

function onMouseDown(e: MouseEvent) {
    if (!isPip.value) return;
    isDragging.value = true;
    dragOffset.value = {
        x: e.clientX - position.value.x,
        y: e.clientY - position.value.y,
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
}

function onMouseMove(e: MouseEvent) {
    if (!isDragging.value) return;
    position.value = {
        x: Math.max(0, Math.min(window.innerWidth - PIP_WIDTH, e.clientX - dragOffset.value.x)),
        y: Math.max(0, Math.min(window.innerHeight - PIP_HEIGHT, e.clientY - dragOffset.value.y)),
    };
}

function onMouseUp() {
    isDragging.value = false;
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);

    const snapped = snapPosition(position.value.x, position.value.y);
    position.value = snapped;
}

function setMode(mode: 'pip' | 'channel' | 'fullscreen') {
    voiceStore.screenShareViewMode = mode;
}

function close() {
    voiceStore.activeScreenShareView = null;
    voiceStore.screenShareViewMode = 'pip';
}

function toggleAudio() {
    voiceStore.screenShareAudioMuted = !voiceStore.screenShareAudioMuted;
}

function navigatePrev() {
    const idx = activeIndex.value;
    if (idx > 0) {
        voiceStore.activeScreenShareView = voiceStore.screenShareParticipants[idx - 1].identity;
    }
}

function navigateNext() {
    const idx = activeIndex.value;
    if (idx < voiceStore.screenShareParticipants.length - 1) {
        voiceStore.activeScreenShareView = voiceStore.screenShareParticipants[idx + 1].identity;
    }
}

function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        if (isFullscreen.value) {
            setMode('channel');
        } else if (isChannel.value) {
            setMode('pip');
        }
    }
}

watch(
    () => voiceStore.screenShareViewMode,
    (mode, oldMode) => {
        if (mode === 'fullscreen' || mode === 'channel') {
            window.addEventListener('keydown', onKeyDown);
        } else if (oldMode === 'fullscreen' || oldMode === 'channel') {
            window.removeEventListener('keydown', onKeyDown);
        }
    },
);

onBeforeUnmount(() => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
    <template v-if="hasScreenShares && activeParticipant">
        <audio ref="audioRef" />

        <div v-if="isFullscreen" class="fixed inset-0 z-50 flex flex-col bg-[#1e1f22]">
            <div class="flex h-12 shrink-0 items-center justify-between bg-[#2b2d31] px-4">
                <div class="flex items-center gap-3">
                    <div class="flex items-center gap-1.5 rounded bg-[#248046] px-2 py-0.5">
                        <Monitor :size="14" class="text-white" />
                        <span class="text-xs font-semibold text-white">LIVE</span>
                    </div>
                    <span class="text-sm font-medium text-[#f2f3f5]">
                        {{ activeParticipant.displayName }}'s screen
                    </span>
                    <span v-if="hasMultiple" class="text-xs text-[#949ba4]">
                        {{ activeIndex + 1 }} / {{ voiceStore.screenShareParticipants.length }}
                    </span>
                </div>
                <div class="flex items-center gap-1">
                    <button
                        v-if="hasMultiple"
                        type="button"
                        class="rounded p-1.5 text-[#b5bac1] transition-colors hover:bg-[#393c41] hover:text-[#f2f3f5]"
                        :disabled="activeIndex <= 0"
                        @click="navigatePrev"
                    >
                        <ChevronLeft :size="18" />
                    </button>
                    <button
                        v-if="hasMultiple"
                        type="button"
                        class="rounded p-1.5 text-[#b5bac1] transition-colors hover:bg-[#393c41] hover:text-[#f2f3f5]"
                        :disabled="activeIndex >= voiceStore.screenShareParticipants.length - 1"
                        @click="navigateNext"
                    >
                        <ChevronRight :size="18" />
                    </button>
                    <button
                        type="button"
                        class="rounded p-1.5 text-[#b5bac1] transition-colors hover:bg-[#393c41] hover:text-[#f2f3f5]"
                        title="Toggle audio"
                        @click="toggleAudio"
                    >
                        <VolumeX v-if="voiceStore.screenShareAudioMuted" :size="18" />
                        <Volume2 v-else :size="18" />
                    </button>
                    <button
                        type="button"
                        class="rounded p-1.5 text-[#b5bac1] transition-colors hover:bg-[#393c41] hover:text-[#f2f3f5]"
                        title="Expand"
                        @click="setMode('channel')"
                    >
                        <Minimize2 :size="18" />
                    </button>
                    <button
                        type="button"
                        class="rounded p-1.5 text-[#b5bac1] transition-colors hover:bg-[#393c41] hover:text-[#f2f3f5]"
                        title="Pop out"
                        @click="setMode('pip')"
                    >
                        <PictureInPicture2 :size="18" />
                    </button>
                    <button
                        type="button"
                        class="rounded p-1.5 text-[#b5bac1] transition-colors hover:bg-[#ed4245] hover:text-white"
                        title="Close"
                        @click="close"
                    >
                        <X :size="18" />
                    </button>
                </div>
            </div>

            <div class="flex min-h-0 flex-1 items-center justify-center bg-[#1e1f22] p-4">
                <video ref="videoRef" autoplay playsinline class="max-h-full max-w-full rounded-lg object-contain" />
            </div>
        </div>

        <div
            v-if="isChannel"
            class="fixed top-9 right-0 bottom-0 left-60 z-40 flex flex-col border-l border-[#1e1f22] bg-[#1e1f22] shadow-2xl"
        >
            <div class="flex h-10 shrink-0 items-center justify-between bg-[#2b2d31] px-3">
                <div class="flex items-center gap-2">
                    <div class="flex items-center gap-1 rounded bg-[#248046] px-1.5 py-0.5">
                        <Monitor :size="12" class="text-white" />
                        <span class="text-[10px] font-semibold text-white">LIVE</span>
                    </div>
                    <span class="text-sm font-medium text-[#f2f3f5]">
                        {{ activeParticipant.displayName }}'s screen
                    </span>
                    <span v-if="hasMultiple" class="text-xs text-[#949ba4]">
                        {{ activeIndex + 1 }} / {{ voiceStore.screenShareParticipants.length }}
                    </span>
                </div>
                <div class="flex items-center gap-0.5">
                    <button
                        v-if="hasMultiple"
                        type="button"
                        class="rounded p-1 text-[#b5bac1] transition-colors hover:bg-[#393c41] hover:text-[#f2f3f5]"
                        :disabled="activeIndex <= 0"
                        @click="navigatePrev"
                    >
                        <ChevronLeft :size="16" />
                    </button>
                    <button
                        v-if="hasMultiple"
                        type="button"
                        class="rounded p-1 text-[#b5bac1] transition-colors hover:bg-[#393c41] hover:text-[#f2f3f5]"
                        :disabled="activeIndex >= voiceStore.screenShareParticipants.length - 1"
                        @click="navigateNext"
                    >
                        <ChevronRight :size="16" />
                    </button>
                    <button
                        type="button"
                        class="rounded p-1 text-[#b5bac1] transition-colors hover:bg-[#393c41] hover:text-[#f2f3f5]"
                        title="Toggle audio"
                        @click="toggleAudio"
                    >
                        <VolumeX v-if="voiceStore.screenShareAudioMuted" :size="16" />
                        <Volume2 v-else :size="16" />
                    </button>
                    <button
                        type="button"
                        class="rounded p-1 text-[#b5bac1] transition-colors hover:bg-[#393c41] hover:text-[#f2f3f5]"
                        title="Fullscreen"
                        @click="setMode('fullscreen')"
                    >
                        <Fullscreen :size="16" />
                    </button>
                    <button
                        type="button"
                        class="rounded p-1 text-[#b5bac1] transition-colors hover:bg-[#393c41] hover:text-[#f2f3f5]"
                        title="Pop out"
                        @click="setMode('pip')"
                    >
                        <PictureInPicture2 :size="16" />
                    </button>
                    <button
                        type="button"
                        class="rounded p-1 text-[#b5bac1] transition-colors hover:bg-[#ed4245] hover:text-white"
                        title="Close"
                        @click="close"
                    >
                        <X :size="16" />
                    </button>
                </div>
            </div>

            <div class="flex min-h-0 flex-1 items-center justify-center p-3">
                <video ref="videoRef" autoplay playsinline class="max-h-full max-w-full rounded-lg object-contain" />
            </div>
        </div>

        <div
            v-if="isPip"
            class="fixed z-40 overflow-hidden rounded-lg border border-[#1e1f22] shadow-2xl"
            :style="{
                left: position.x + 'px',
                top: position.y + 'px',
                width: PIP_WIDTH + 'px',
                height: PIP_HEIGHT + 'px',
                cursor: isDragging ? 'grabbing' : 'grab',
                transition: isDragging ? 'none' : 'left 0.3s ease, top 0.3s ease',
            }"
            @mousedown="onMouseDown"
        >
            <video ref="videoRef" autoplay playsinline class="h-full w-full bg-[#1e1f22] object-cover" />

            <div
                class="absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-black/60 via-transparent to-black/60 opacity-0 transition-opacity hover:opacity-100"
            >
                <div class="flex items-center justify-between px-2 py-1.5">
                    <div class="flex items-center gap-1.5">
                        <div class="flex items-center gap-1 rounded bg-[#248046] px-1 py-0.5">
                            <Monitor :size="10" class="text-white" />
                            <span class="text-[9px] font-bold text-white">LIVE</span>
                        </div>
                        <span class="max-w-[160px] truncate text-xs font-medium text-white">
                            {{ activeParticipant.displayName }}
                        </span>
                    </div>
                    <button
                        type="button"
                        class="rounded p-0.5 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                        title="Close"
                        @click.stop="close"
                    >
                        <X :size="14" />
                    </button>
                </div>

                <div class="flex items-center justify-between px-2 py-1.5">
                    <div class="flex items-center gap-0.5">
                        <button
                            v-if="hasMultiple"
                            type="button"
                            class="rounded p-0.5 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                            :disabled="activeIndex <= 0"
                            @click.stop="navigatePrev"
                        >
                            <ChevronLeft :size="14" />
                        </button>
                        <span v-if="hasMultiple" class="text-[10px] text-white/60">
                            {{ activeIndex + 1 }}/{{ voiceStore.screenShareParticipants.length }}
                        </span>
                        <button
                            v-if="hasMultiple"
                            type="button"
                            class="rounded p-0.5 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                            :disabled="activeIndex >= voiceStore.screenShareParticipants.length - 1"
                            @click.stop="navigateNext"
                        >
                            <ChevronRight :size="14" />
                        </button>
                    </div>
                    <div class="flex items-center gap-0.5">
                        <button
                            type="button"
                            class="rounded p-0.5 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                            title="Toggle audio"
                            @click.stop="toggleAudio"
                        >
                            <VolumeX v-if="voiceStore.screenShareAudioMuted" :size="14" />
                            <Volume2 v-else :size="14" />
                        </button>
                        <button
                            type="button"
                            class="rounded p-0.5 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                            title="Expand"
                            @click.stop="setMode('channel')"
                        >
                            <Maximize2 :size="14" />
                        </button>
                        <button
                            type="button"
                            class="rounded p-0.5 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                            title="Fullscreen"
                            @click.stop="setMode('fullscreen')"
                        >
                            <Fullscreen :size="14" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </template>
</template>
