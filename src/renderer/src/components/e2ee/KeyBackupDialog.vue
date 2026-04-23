<script setup lang="ts">
import { Key, Loader2, AlertCircle, CheckCircle2 } from 'lucide-vue-next';
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useE2eeStore } from '@/stores/e2ee';

const props = defineProps<{
    open: boolean;
    restoreMode?: boolean;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'complete'): void;
}>();

const { t } = useI18n();
const e2eeStore = useE2eeStore();

const pin = ref('');
const pinConfirm = ref('');
const processing = ref(false);
const error = ref('');
const success = ref(false);

const isValidPin = computed(() => pin.value.length >= 6);
const pinsMatch = computed(() => pin.value === pinConfirm.value);
const canSubmit = computed(() => {
    if (props.restoreMode) return isValidPin.value;
    return isValidPin.value && pinsMatch.value;
});

async function handleCreate() {
    if (!canSubmit.value) return;
    processing.value = true;
    error.value = '';

    try {
        const ok = await e2eeStore.createBackup(pin.value);
        if (ok) {
            success.value = true;
            setTimeout(() => emit('complete'), 1500);
        } else {
            error.value = e2eeStore.error ?? t('e2ee.backup.backupFailed');
        }
    } catch (err: unknown) {
        error.value = err instanceof Error ? err.message : t('e2ee.backup.backupFailed');
    } finally {
        processing.value = false;
    }
}

async function handleRestore() {
    if (!canSubmit.value) return;
    processing.value = true;
    error.value = '';

    try {
        const ok = await e2eeStore.restoreFromBackup(pin.value);
        if (ok) {
            success.value = true;
            setTimeout(() => emit('complete'), 1500);
        } else {
            error.value = e2eeStore.error ?? t('e2ee.wizard.incorrectPin');
        }
    } catch (err: unknown) {
        error.value = err instanceof Error ? err.message : t('e2ee.backup.restoreFailed');
    } finally {
        processing.value = false;
    }
}

function handleSubmit() {
    if (props.restoreMode) {
        handleRestore();
    } else {
        handleCreate();
    }
}
</script>

<template>
    <Dialog
        :open="open"
        @update:open="
            (val) => {
                if (!val) emit('close');
            }
        "
    >
        <DialogContent class="max-w-md">
            <DialogHeader>
                <DialogTitle class="flex items-center gap-2">
                    <Key class="text-primary h-5 w-5" />
                    {{ restoreMode ? t('e2ee.backup.restoreTitle') : t('e2ee.backup.createTitle') }}
                </DialogTitle>
                <DialogDescription>
                    {{ restoreMode ? t('e2ee.backup.restoreDescription') : t('e2ee.backup.createDescription') }}
                </DialogDescription>
            </DialogHeader>

            <div v-if="success" class="flex flex-col items-center gap-3 py-6">
                <div class="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                    <CheckCircle2 class="h-6 w-6 text-green-500" />
                </div>
                <p class="font-medium">
                    {{ restoreMode ? t('e2ee.backup.keysRestored') : t('e2ee.backup.backupCreated') }}
                </p>
            </div>

            <div v-else class="space-y-4 py-2">
                <div>
                    <Label for="backup-pin-input">
                        {{ restoreMode ? t('e2ee.backup.backupPinLabel') : t('e2ee.backup.choosePinLabel') }}
                    </Label>
                    <Input
                        id="backup-pin-input"
                        v-model="pin"
                        type="password"
                        :placeholder="
                            restoreMode ? t('e2ee.backup.pinPlaceholderRestore') : t('e2ee.backup.pinPlaceholderCreate')
                        "
                        class="mt-1.5"
                        @keydown.enter="handleSubmit"
                    />
                </div>

                <div v-if="!restoreMode">
                    <Label for="backup-pin-confirm">{{ t('e2ee.backup.confirmPin') }}</Label>
                    <Input
                        id="backup-pin-confirm"
                        v-model="pinConfirm"
                        type="password"
                        :placeholder="t('e2ee.backup.confirmPinPlaceholder')"
                        class="mt-1.5"
                        @keydown.enter="handleSubmit"
                    />
                    <p v-if="pinConfirm && !pinsMatch" class="text-destructive mt-1 text-sm">
                        {{ t('e2ee.backup.pinsDoNotMatch') }}
                    </p>
                </div>

                <p v-if="error" class="text-destructive text-sm">
                    <AlertCircle class="mr-1 inline h-4 w-4" />
                    {{ error }}
                </p>

                <div v-if="!restoreMode" class="bg-muted/50 text-muted-foreground rounded-md p-3 text-xs">
                    <p>
                        <strong>{{ t('e2ee.backup.importantLabel') }}</strong>
                    </p>
                    <ul class="mt-1 list-inside list-disc space-y-1">
                        <li>{{ t('e2ee.backup.warningPinOnly') }}</li>
                        <li>{{ t('e2ee.backup.warningNeverSent') }}</li>
                        <li>{{ t('e2ee.backup.warningForgotten') }}</li>
                        <li>{{ t('e2ee.backup.warningStrong') }}</li>
                    </ul>
                </div>
            </div>

            <DialogFooter v-if="!success">
                <Button variant="ghost" @click="emit('close')">{{ t('common.cancel') }}</Button>
                <Button :disabled="!canSubmit || processing" @click="handleSubmit">
                    <Loader2 v-if="processing" class="mr-2 h-4 w-4 animate-spin" />
                    {{ restoreMode ? t('e2ee.backup.restoreKeys') : t('e2ee.backup.createBackup') }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
