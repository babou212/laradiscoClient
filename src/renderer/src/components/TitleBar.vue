<script setup lang="ts">
import { Minus, Square, X } from 'lucide-vue-next';
import { onMounted, onUnmounted, ref } from 'vue';

const isMaximized = ref(false);
const isMac = ref(false);

onMounted(async () => {
    isMac.value = window.api.window.platform === 'darwin';
    isMaximized.value = await window.api.window.isMaximized();

    window.api.window.onMaximizedChange((_event, maximized) => {
        isMaximized.value = maximized;
    });
});

onUnmounted(() => {
    window.api.window.removeMaximizedListener();
});

function minimize(): void {
    window.api.window.minimize();
}

function maximize(): void {
    window.api.window.maximize();
}

function close(): void {
    window.api.window.close();
}
</script>

<template>
    <div
        class="title-bar flex h-9 select-none items-center border-b border-border bg-sidebar"
        :class="{ 'pl-[70px]': isMac }"
    >
        <div class="title-bar-drag flex min-w-0 flex-1 items-center gap-2 px-3">
            <span class="truncate text-xs font-medium text-sidebar-foreground/60">
                LaraDisco
            </span>
        </div>

        <div v-if="!isMac" class="flex items-center">
            <button
                class="title-bar-button flex h-9 w-11 items-center justify-center text-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus:outline-none"
                aria-label="Minimize"
                @click="minimize"
            >
                <Minus class="size-4" :stroke-width="1.5" />
            </button>
            <button
                class="title-bar-button flex h-9 w-11 items-center justify-center text-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus:outline-none"
                aria-label="Maximize"
                @click="maximize"
            >
                <Square v-if="!isMaximized" class="size-3" :stroke-width="1.5" />
                <svg
                    v-else
                    class="size-3"
                    viewBox="0 0 12 12"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.2"
                >
                    <rect x="2.5" y="3.5" width="7" height="7" rx="0.5" />
                    <path d="M3.5 3.5V2a.5.5 0 0 1 .5-.5h6a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-.5.5H9" />
                </svg>
            </button>
            <button
                class="title-bar-button flex h-9 w-11 items-center justify-center text-foreground/70 transition-colors hover:bg-destructive hover:text-white focus:outline-none"
                aria-label="Close"
                @click="close"
            >
                <X class="size-4" :stroke-width="1.5" />
            </button>
        </div>
    </div>
</template>

<style scoped>
.title-bar-drag {
    -webkit-app-region: drag;
    app-region: drag;
}

.title-bar-button {
    -webkit-app-region: no-drag;
    app-region: no-drag;
}
</style>
