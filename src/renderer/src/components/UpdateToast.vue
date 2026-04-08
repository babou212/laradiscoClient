<script setup lang="ts">
import { AlertTriangle, Download, RefreshCw, X } from 'lucide-vue-next';
import { onMounted, onUnmounted, ref } from 'vue';

type ToastState = 'idle' | 'available' | 'downloading' | 'ready' | 'error';

const state = ref<ToastState>('idle');
const version = ref<string>('');
const progressPercent = ref<number>(0);
const errorMessage = ref<string>('');
const dismissing = ref<boolean>(false);

function dismiss(): void {
    dismissing.value = true;
    setTimeout(() => {
        state.value = 'idle';
        dismissing.value = false;
    }, 300);
}

async function handleDownload(): Promise<void> {
    state.value = 'downloading';
    progressPercent.value = 0;
    const result = await window.api.updater.download();
    if (!result.success) {
        errorMessage.value = result.error ?? 'Download failed';
        state.value = 'error';
    }
}

function handleRestart(): void {
    window.api.updater.install();
}

function formatPercent(value: number): string {
    return `${Math.round(value)}%`;
}

onMounted(() => {
    window.api.updater.onUpdateAvailable((info) => {
        version.value = info.version;
        state.value = 'available';
        dismissing.value = false;
    });

    window.api.updater.onDownloadProgress((progress) => {
        progressPercent.value = progress.percent;
        if (state.value !== 'downloading') {
            state.value = 'downloading';
        }
    });

    window.api.updater.onUpdateDownloaded(() => {
        state.value = 'ready';
        dismissing.value = false;
    });

    window.api.updater.onError((error) => {
        errorMessage.value = error;
        state.value = 'error';
        dismissing.value = false;
    });
});

onUnmounted(() => {
    window.api.updater.removeAllListeners();
});
</script>

<template>
    <Transition
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="translate-x-full opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-active-class="transition-all duration-300 ease-in"
        leave-from-class="translate-x-0 opacity-100"
        leave-to-class="translate-x-full opacity-0"
    >
        <div
            v-if="state !== 'idle' && !dismissing"
            class="border-border bg-popover pointer-events-auto fixed right-4 bottom-4 z-[100] w-80 overflow-hidden rounded-lg border shadow-lg"
        >
            <div class="flex items-start gap-3 p-3">
                <div
                    class="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full"
                >
                    <component
                        :is="state === 'error' ? AlertTriangle : state === 'ready' ? RefreshCw : Download"
                        :size="16"
                    />
                </div>

                <div class="min-w-0 flex-1">
                    <template v-if="state === 'available'">
                        <div class="text-sm font-semibold">Update available</div>
                        <div class="text-muted-foreground mt-0.5 text-xs">Version {{ version }} is ready to download.</div>
                        <div class="mt-2 flex gap-2">
                            <button
                                class="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1 text-xs font-medium transition-colors"
                                @click="handleDownload"
                            >
                                Download
                            </button>
                            <button
                                class="hover:bg-accent text-muted-foreground hover:text-foreground rounded px-3 py-1 text-xs font-medium transition-colors"
                                @click="dismiss"
                            >
                                Later
                            </button>
                        </div>
                    </template>

                    <template v-else-if="state === 'downloading'">
                        <div class="text-sm font-semibold">Downloading update</div>
                        <div class="text-muted-foreground mt-0.5 text-xs">Version {{ version }} — {{ formatPercent(progressPercent) }}</div>
                        <div class="bg-muted mt-2 h-1.5 overflow-hidden rounded-full">
                            <div
                                class="bg-primary h-full transition-all duration-200 ease-out"
                                :style="{ width: `${progressPercent}%` }"
                            />
                        </div>
                    </template>

                    <template v-else-if="state === 'ready'">
                        <div class="text-sm font-semibold">Update ready</div>
                        <div class="text-muted-foreground mt-0.5 text-xs">Restart LaraDisco to install version {{ version }}.</div>
                        <div class="mt-2 flex gap-2">
                            <button
                                class="bg-primary text-primary-foreground hover:bg-primary/90 rounded px-3 py-1 text-xs font-medium transition-colors"
                                @click="handleRestart"
                            >
                                Restart now
                            </button>
                            <button
                                class="hover:bg-accent text-muted-foreground hover:text-foreground rounded px-3 py-1 text-xs font-medium transition-colors"
                                @click="dismiss"
                            >
                                Later
                            </button>
                        </div>
                    </template>

                    <template v-else-if="state === 'error'">
                        <div class="text-sm font-semibold">Update failed</div>
                        <div class="text-muted-foreground mt-0.5 text-xs break-words">{{ errorMessage }}</div>
                    </template>
                </div>

                <button
                    v-if="state !== 'downloading'"
                    class="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 rounded p-1 transition-colors"
                    @click="dismiss"
                >
                    <X :size="14" />
                </button>
            </div>
        </div>
    </Transition>
</template>
