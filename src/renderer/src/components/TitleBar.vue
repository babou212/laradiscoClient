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
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 40 42"
                class="size-4 shrink-0 fill-current text-sidebar-foreground/60"
            >
                <path
                    fill="currentColor"
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M17.2 5.633 8.6.855 0 5.633v26.51l16.2 9 16.2-9v-8.442l7.6-4.223V9.856l-8.6-4.777-8.6 4.777V18.3l-5.6 3.111V5.633ZM38 18.301l-5.6 3.11v-6.157l5.6-3.11V18.3Zm-1.06-7.856-5.54 3.078-5.54-3.079 5.54-3.078 5.54 3.079ZM24.8 18.3v-6.157l5.6 3.111v6.158L24.8 18.3Zm-1 1.732 5.54 3.078-13.14 7.302-5.54-3.078 13.14-7.3v-.002Zm-16.2 7.89 7.6 4.222V38.3L2 30.966V7.92l5.6 3.111v16.892ZM8.6 9.3 3.06 6.222 8.6 3.143l5.54 3.08L8.6 9.3Zm21.8 15.51-13.2 7.334V38.3l13.2-7.334v-6.156ZM9.6 11.034l5.6-3.11v14.6l-5.6 3.11v-14.6Z"
                />
            </svg>
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
