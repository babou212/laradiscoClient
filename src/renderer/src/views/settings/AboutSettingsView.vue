<!-- AboutSettingsView - App version + manual update check -->

<script setup lang="ts">
import { CheckCircle2, Loader2 } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/components/ui/button';

const { t } = useI18n();

type CheckState = 'idle' | 'checking' | 'up-to-date' | 'available' | 'error';

const version = ref<string>('');
const checkState = ref<CheckState>('idle');
const checkMessage = ref<string>('');

onMounted(async () => {
    version.value = await window.api.updater.getVersion();
});

async function checkForUpdates(): Promise<void> {
    checkState.value = 'checking';
    checkMessage.value = '';
    const result = await window.api.updater.check();

    if (!result.success) {
        checkState.value = 'error';
        checkMessage.value = result.error ?? t('settings.about.updates.failed');
        return;
    }

    if (result.version && result.version !== version.value) {
        // The main process has already emitted updater:update-available, which
        // the global UpdateToast picks up. Just reflect it in this panel too.
        checkState.value = 'available';
        checkMessage.value = t('settings.about.updates.available', { version: result.version });
    } else {
        checkState.value = 'up-to-date';
        checkMessage.value = t('settings.about.updates.upToDate');
    }
}
</script>

<template>
    <div class="space-y-6">
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">{{ t('settings.about.title') }}</h2>
                <p class="text-muted-foreground mt-1 text-sm">{{ t('settings.about.description') }}</p>
            </div>
            <div class="space-y-4 p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <div class="text-sm font-medium">{{ t('settings.about.version') }}</div>
                        <div class="text-muted-foreground text-xs">{{ version || '—' }}</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">{{ t('settings.about.updates.title') }}</h2>
                <p class="text-muted-foreground mt-1 text-sm">
                    {{ t('settings.about.updates.description') }}
                </p>
            </div>
            <div class="space-y-4 p-6">
                <Button :disabled="checkState === 'checking'" @click="checkForUpdates">
                    <Loader2 v-if="checkState === 'checking'" class="mr-2 h-4 w-4 animate-spin" />
                    {{
                        checkState === 'checking'
                            ? t('settings.about.updates.checking')
                            : t('settings.about.updates.check')
                    }}
                </Button>

                <div v-if="checkMessage" class="text-sm">
                    <div v-if="checkState === 'up-to-date'" class="text-muted-foreground flex items-center gap-2">
                        <CheckCircle2 class="h-4 w-4 text-green-500" />
                        {{ checkMessage }}
                    </div>
                    <div v-else-if="checkState === 'available'" class="text-foreground">
                        {{ checkMessage }}
                    </div>
                    <div v-else-if="checkState === 'error'" class="text-destructive">
                        {{ checkMessage }}
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
