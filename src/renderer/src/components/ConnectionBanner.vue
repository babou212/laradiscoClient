<script setup lang="ts">
import { RefreshCw, WifiOff } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useConnectionStore } from '@/stores/connection';

const { t } = useI18n();
const { status } = storeToRefs(useConnectionStore());
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
    </Transition>
</template>
