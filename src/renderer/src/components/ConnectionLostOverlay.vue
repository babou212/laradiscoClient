<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import ratLogo from '@/assets/images/rat.png';
import { useServerStore } from '@/stores/server';

// Only shown once the drop has lasted a few seconds, so a brief blip doesn't
// flash the whole screen.
const SHOW_AFTER_MS = 3000;

// Tracks the app's *actual* theme (the `.dark` class toggled by useAppearance,
// driven by the saved appearance setting — not the OS preference). Read
// directly off <html> and kept live via MutationObserver so this can't drift
// out of sync with whatever CSS cascade order Tailwind/scoped styles happen
// to load in.
const isDark = ref(document.documentElement.classList.contains('dark'));
let themeObserver: MutationObserver | null = null;

const photoFilter = computed(() =>
    isDark.value ? 'brightness(1.15) contrast(1.02) saturate(1.05)' : 'brightness(0.94) contrast(1.04) saturate(1.05)',
);
const shadowBackground = computed(() =>
    isDark.value
        ? 'radial-gradient(ellipse at center, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0.07) 50%, rgba(255, 255, 255, 0) 75%)'
        : 'radial-gradient(ellipse at center, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.14) 50%, rgba(0, 0, 0, 0) 75%)',
);

// Dev-only: visit http://localhost:5173/?preview-disconnect to force this
// overlay on screen immediately, without needing a real dropped connection.
const previewingDisconnect = import.meta.env.DEV && new URLSearchParams(location.search).has('preview-disconnect');

const serverStore = useServerStore();
const visible = ref(previewingDisconnect);
let showTimer: ReturnType<typeof setTimeout> | null = null;

watch(
    () => serverStore.wsConnected,
    (connected) => {
        if (previewingDisconnect) return;

        if (connected) {
            if (showTimer) {
                clearTimeout(showTimer);
                showTimer = null;
            }
            visible.value = false;
            return;
        }

        if (showTimer) return;
        showTimer = setTimeout(() => {
            showTimer = null;
            visible.value = true;
        }, SHOW_AFTER_MS);
    },
);

onMounted(() => {
    themeObserver = new MutationObserver(() => {
        isDark.value = document.documentElement.classList.contains('dark');
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
});

onUnmounted(() => {
    if (showTimer) clearTimeout(showTimer);
    themeObserver?.disconnect();
});
</script>

<template>
    <Transition
        enter-active-class="transition-opacity duration-300 ease-out"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-300 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
    >
        <div
            v-if="visible"
            class="bg-background fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-5"
        >
            <div class="reconnect-stage">
                <img
                    :src="ratLogo"
                    alt=""
                    aria-hidden="true"
                    class="reconnect-photo"
                    :style="{ filter: photoFilter }"
                />
            </div>
            <div class="reconnect-shadow" :style="{ background: shadowBackground }"></div>
            <div class="text-muted-foreground flex items-baseline text-[0.95rem] font-medium">
                <span>Hang on&hellip; Gnawing through cables</span>
                <span class="reconnect-dots ml-0.5 inline-flex"> <span>.</span><span>.</span><span>.</span> </span>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
.reconnect-stage {
    margin-top: 1.5rem;
    transform: translateX(-9px);
}

.reconnect-photo {
    width: auto;
    height: 180px;
    display: block;
    transform-origin: 50% 50%;
    filter: brightness(0.94) contrast(1.04) saturate(1.05);
    animation: reconnect-pulse 1.5s ease-in-out infinite;
}

.reconnect-shadow {
    width: 150px;
    height: 22px;
    margin-top: 0.25rem;
    border-radius: 50%;
    background: radial-gradient(
        ellipse at center,
        rgba(0, 0, 0, 0.3) 0%,
        rgba(0, 0, 0, 0.14) 50%,
        rgba(0, 0, 0, 0) 75%
    );
    animation: reconnect-shadow-pulse 1.5s ease-in-out infinite;
}

.reconnect-dots span {
    opacity: 0;
}
.reconnect-dots span:nth-child(1) {
    animation: reconnect-dot-1 2s infinite;
}
.reconnect-dots span:nth-child(2) {
    animation: reconnect-dot-2 2s infinite;
}
.reconnect-dots span:nth-child(3) {
    animation: reconnect-dot-3 2s infinite;
}

@keyframes reconnect-pulse {
    0%,
    100% {
        transform: scale(1);
    }
    50% {
        transform: scale(1.1);
    }
}

@keyframes reconnect-shadow-pulse {
    0%,
    100% {
        transform: scale(1);
        opacity: 0.85;
    }
    50% {
        transform: scale(1.12);
        opacity: 1;
    }
}

@keyframes reconnect-dot-1 {
    0%,
    25% {
        opacity: 0;
    }
    27%,
    97% {
        opacity: 1;
    }
    100% {
        opacity: 0;
    }
}

@keyframes reconnect-dot-2 {
    0%,
    50% {
        opacity: 0;
    }
    52%,
    97% {
        opacity: 1;
    }
    100% {
        opacity: 0;
    }
}

@keyframes reconnect-dot-3 {
    0%,
    75% {
        opacity: 0;
    }
    77%,
    97% {
        opacity: 1;
    }
    100% {
        opacity: 0;
    }
}

@media (prefers-reduced-motion: reduce) {
    .reconnect-photo,
    .reconnect-shadow {
        animation: none;
    }
    .reconnect-dots span {
        animation: none;
        opacity: 1;
    }
}
</style>
