<script setup lang="ts">
import { ref, computed } from 'vue';
import { Key, Loader2, AlertCircle, CheckCircle2 } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useE2eeStore } from '@/stores/e2ee';

const props = defineProps<{
    open: boolean;
    restoreMode?: boolean;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'complete'): void;
}>();

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
            error.value = e2eeStore.error ?? 'Backup failed';
        }
    } catch (err: any) {
        error.value = err.message ?? 'Backup failed';
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
            error.value = e2eeStore.error ?? 'Incorrect PIN';
        }
    } catch (err: any) {
        error.value = err.message ?? 'Restore failed';
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
    <Dialog :open="open" @update:open="(val) => { if (!val) emit('close'); }">
        <DialogContent class="max-w-md">
            <DialogHeader>
                <DialogTitle class="flex items-center gap-2">
                    <Key class="h-5 w-5 text-primary" />
                    {{ restoreMode ? 'Restore Key Backup' : 'Create Key Backup' }}
                </DialogTitle>
                <DialogDescription>
                    {{ restoreMode
                        ? 'Enter the PIN you used when creating your backup.'
                        : 'Choose a PIN to encrypt your key backup. You\'ll need this PIN to restore your keys on another device.'
                    }}
                </DialogDescription>
            </DialogHeader>

            <!-- Success state -->
            <div v-if="success" class="flex flex-col items-center gap-3 py-6">
                <div class="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                    <CheckCircle2 class="h-6 w-6 text-green-500" />
                </div>
                <p class="font-medium">
                    {{ restoreMode ? 'Keys Restored Successfully!' : 'Backup Created Successfully!' }}
                </p>
            </div>

            <!-- Form -->
            <div v-else class="space-y-4 py-2">
                <div>
                    <Label for="backup-pin-input">
                        {{ restoreMode ? 'Backup PIN' : 'Choose a PIN' }}
                    </Label>
                    <Input
                        id="backup-pin-input"
                        v-model="pin"
                        type="password"
                        :placeholder="restoreMode ? 'Enter your backup PIN' : 'Minimum 6 characters'"
                        class="mt-1.5"
                        @keydown.enter="handleSubmit"
                    />
                </div>

                <div v-if="!restoreMode">
                    <Label for="backup-pin-confirm">Confirm PIN</Label>
                    <Input
                        id="backup-pin-confirm"
                        v-model="pinConfirm"
                        type="password"
                        placeholder="Enter PIN again"
                        class="mt-1.5"
                        @keydown.enter="handleSubmit"
                    />
                    <p
                        v-if="pinConfirm && !pinsMatch"
                        class="mt-1 text-sm text-destructive"
                    >
                        PINs do not match
                    </p>
                </div>

                <p v-if="error" class="text-sm text-destructive">
                    <AlertCircle class="mr-1 inline h-4 w-4" />
                    {{ error }}
                </p>

                <div
                    v-if="!restoreMode"
                    class="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground"
                >
                    <p><strong>Important:</strong></p>
                    <ul class="mt-1 list-inside list-disc space-y-1">
                        <li>This PIN is used only for encrypting your key backup</li>
                        <li>It is never sent to the server</li>
                        <li>If you forget your PIN, you cannot restore your keys</li>
                        <li>The backup uses strong encryption (Argon2id + AES-256-GCM)</li>
                    </ul>
                </div>
            </div>

            <DialogFooter v-if="!success">
                <Button variant="ghost" @click="emit('close')">Cancel</Button>
                <Button
                    :disabled="!canSubmit || processing"
                    @click="handleSubmit"
                >
                    <Loader2 v-if="processing" class="mr-2 h-4 w-4 animate-spin" />
                    {{ restoreMode ? 'Restore Keys' : 'Create Backup' }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
