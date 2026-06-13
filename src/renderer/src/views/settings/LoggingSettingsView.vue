<!-- LoggingSettingsView - Locate and export the app log file for support -->

<script setup lang="ts">
import { CheckCircle2, FolderOpen, Loader2, Save } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/components/ui/button';

const { t } = useI18n();

const logPath = ref<string>('');
const saving = ref(false);
const recentlySaved = ref(false);
const errorMessage = ref<string>('');

onMounted(async () => {
    logPath.value = await window.api.log.getPath();
});

async function saveLog(): Promise<void> {
    saving.value = true;
    errorMessage.value = '';
    try {
        const result = await window.api.log.save();
        if (result.success) {
            recentlySaved.value = true;
            setTimeout(() => (recentlySaved.value = false), 3000);
        } else if (!result.canceled) {
            errorMessage.value = result.error ?? t('settings.logging.saveFailed');
        }
    } finally {
        saving.value = false;
    }
}

async function revealLog(): Promise<void> {
    await window.api.log.reveal();
}
</script>

<template>
    <div class="space-y-6">
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">{{ t('settings.logging.title') }}</h2>
                <p class="text-muted-foreground mt-1 text-sm">{{ t('settings.logging.description') }}</p>
            </div>
            <div class="space-y-4 p-6">
                <div>
                    <div class="text-sm font-medium">{{ t('settings.logging.location') }}</div>
                    <code
                        class="text-muted-foreground bg-muted/50 mt-1 block rounded px-3 py-2 font-mono text-xs break-all"
                    >
                        {{ logPath || '—' }}
                    </code>
                </div>

                <div class="flex flex-wrap items-center gap-3">
                    <Button :disabled="saving" @click="saveLog">
                        <Loader2 v-if="saving" class="mr-2 h-4 w-4 animate-spin" />
                        <Save v-else class="mr-2 h-4 w-4" />
                        {{ t('settings.logging.save') }}
                    </Button>
                    <Button variant="outline" @click="revealLog">
                        <FolderOpen class="mr-2 h-4 w-4" />
                        {{ t('settings.logging.reveal') }}
                    </Button>
                </div>

                <Transition
                    enter-active-class="transition ease-in-out duration-300"
                    enter-from-class="opacity-0"
                    leave-active-class="transition ease-in-out duration-300"
                    leave-to-class="opacity-0"
                >
                    <div
                        v-show="recentlySaved"
                        class="flex items-center gap-2 text-sm text-green-600 dark:text-green-500"
                    >
                        <CheckCircle2 class="h-4 w-4" />
                        {{ t('settings.logging.saved') }}
                    </div>
                </Transition>

                <div v-if="errorMessage" class="text-destructive text-sm">{{ errorMessage }}</div>
            </div>
        </div>
    </div>
</template>
