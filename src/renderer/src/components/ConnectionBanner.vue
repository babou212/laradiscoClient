<script setup lang="ts">
import { CircleCheck, RefreshCw, WifiOff } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useConnectionStore } from '@/stores/connection';

const CONNECTED_FLASH_MS = 2500;

const { t } = useI18n();
const { status } = storeToRefs(useConnectionStore());

const showConnected = ref(false);
let flashTimer: ReturnType<typeof setTimeout> | null = null;

const clearFlashTimer = () => {
    if (flashTimer) {
        clearTimeout(flashTimer);
        flashTimer = null;
    }
};

watch(status, (next, prev) => {
    if (next === 'connected' && (prev === 'reconnecting' || prev === 'disconnected')) {
        showConnected.value = true;
        clearFlashTimer();
        flashTimer = setTimeout(() => {
            flashTimer = null;
            showConnected.value = false;
        }, CONNECTED_FLASH_MS);
        return;
    }

    if (next !== 'connected') {
        clearFlashTimer();
        showConnected.value = false;
    }
});

onBeforeUnmount(clearFlashTimer);
</script>

<template>
    <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="-translate-y-full opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition-all duration-200 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="-translate-y-full opacity-0"
    >
        <div
            v-if="status === 'reconnecting'"
            class="bg-muted text-muted-foreground border-border flex shrink-0 items-center justify-center gap-2 border-b px-3 py-1.5 text-xs font-medium"
            role="status"
            aria-live="polite"
        >
            <RefreshCw :size="14" class="animate-spin" />
            <span>{{ t('connection.reconnecting') }}</span>
        </div>
        <div
            v-else-if="status === 'disconnected'"
            class="bg-destructive text-destructive-foreground flex shrink-0 items-center justify-center gap-2 px-3 py-1.5 text-xs font-semibold"
            role="alert"
            aria-live="assertive"
        >
            <WifiOff :size="14" />
            <span>{{ t('connection.lost') }}</span>
        </div>
        <div
            v-else-if="showConnected"
            class="flex shrink-0 items-center justify-center gap-2 bg-green-600 px-3 py-1.5 text-xs font-medium text-white"
            role="status"
            aria-live="polite"
        >
            <CircleCheck :size="14" />
            <span>{{ t('connection.connected') }}</span>
        </div>
    </Transition>
</template>
