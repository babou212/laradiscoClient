<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Shield, Key, Loader2, AlertCircle, CheckCircle2 } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useE2eeStore } from '@/stores/e2ee';
import KeyBackupDialog from './KeyBackupDialog.vue';

const router = useRouter();
const e2eeStore = useE2eeStore();

const deviceName = ref('');
const backupPin = ref('');
const pinError = ref('');
const isChecking = ref(true);
const showBackupDialog = ref(false);

const step = computed(() => e2eeStore.setupStep);

onMounted(async () => {
    isChecking.value = true;

    // Default device name
    const platform = window.api?.window?.platform ?? 'unknown';
    const platformNames: Record<string, string> = {
        darwin: 'Mac',
        win32: 'Windows PC',
        linux: 'Linux PC',
    };
    deviceName.value = platformNames[platform] ?? 'Desktop';

    const hasBackup = await e2eeStore.checkBackup();
    if (hasBackup) {
        e2eeStore.setupStep = 'restore';
        isChecking.value = false;
    } else {
        // New user — auto-generate keys immediately
        e2eeStore.setupStep = 'setup';
        isChecking.value = false;
        await autoSetup();
    }
});

async function autoSetup() {
    const name = deviceName.value.trim() || 'Desktop';
    const success = await e2eeStore.performSetup(name);
    if (success) {
        // Backup is mandatory — show the backup dialog
        showBackupDialog.value = true;
    }
}

async function handleRestore() {
    if (!backupPin.value) return;
    pinError.value = '';
    const success = await e2eeStore.restoreFromBackup(backupPin.value);
    if (success) {
        await e2eeStore.performDeviceSetup(deviceName.value.trim() || 'Desktop');
    } else {
        pinError.value = e2eeStore.error ?? 'Incorrect PIN';
    }
}

function skipRestore() {
    e2eeStore.setupStep = 'setup';
    autoSetup();
}

function handleBackupComplete() {
    showBackupDialog.value = false;
    e2eeStore.setupStep = 'done';
    router.replace({ name: 'home' });
}

function handleBackupClose() {
    showBackupDialog.value = false;
    e2eeStore.setupStep = 'done';
    router.replace({ name: 'home' });
}

watch(step, (newStep) => {
    if (newStep === 'done') {
        router.replace({ name: 'home' });
    }
});
</script>

<template>
    <div class="bg-background flex min-h-full items-center justify-center p-4">
        <div class="w-full max-w-lg space-y-6">
            <!-- Header -->
            <div class="text-center">
                <div class="bg-primary/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                    <Shield class="text-primary h-8 w-8" />
                </div>
                <h1 class="text-2xl font-bold tracking-tight">End-to-End Encryption</h1>
                <p class="text-muted-foreground mt-2 text-sm">
                    Secure your messages so only you and the intended recipients can read them.
                </p>
            </div>

            <!-- Loading / Checking -->
            <div v-if="isChecking" class="flex flex-col items-center gap-3 py-8">
                <Loader2 class="text-muted-foreground h-6 w-6 animate-spin" />
                <p class="text-muted-foreground text-sm">Checking encryption status...</p>
            </div>

            <!-- Restore from Backup -->
            <div v-else-if="step === 'restore'" class="bg-card space-y-4 rounded-lg border p-6">
                <div class="flex items-start gap-3">
                    <Key class="text-primary mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                        <h2 class="font-semibold">Restore Your Keys</h2>
                        <p class="text-muted-foreground mt-1 text-sm">
                            A key backup was found. Enter your backup PIN to restore your encryption identity on this
                            device.
                        </p>
                    </div>
                </div>

                <div class="space-y-3">
                    <div>
                        <Label for="device-name-restore">Device Name</Label>
                        <Input
                            id="device-name-restore"
                            v-model="deviceName"
                            placeholder="e.g. My Laptop"
                            class="mt-1.5"
                        />
                    </div>
                    <div>
                        <Label for="backup-pin">Backup PIN</Label>
                        <Input
                            id="backup-pin"
                            v-model="backupPin"
                            type="password"
                            placeholder="Enter your backup PIN"
                            class="mt-1.5"
                            @keydown.enter="handleRestore"
                        />
                        <p v-if="pinError" class="text-destructive mt-1 text-sm">{{ pinError }}</p>
                    </div>
                </div>

                <div class="flex gap-2">
                    <Button class="flex-1" :disabled="!backupPin || e2eeStore.isSettingUp" @click="handleRestore">
                        <Loader2 v-if="e2eeStore.isSettingUp" class="mr-2 h-4 w-4 animate-spin" />
                        Restore & Continue
                    </Button>
                    <Button variant="ghost" @click="skipRestore"> New Identity </Button>
                </div>

                <p v-if="e2eeStore.error && !pinError" class="text-destructive text-sm">
                    <AlertCircle class="mr-1 inline h-4 w-4" />
                    {{ e2eeStore.error }}
                </p>
            </div>

            <!-- Fresh Setup (auto-generating) -->
            <div v-else-if="step === 'setup'" class="bg-card space-y-4 rounded-lg border p-6">
                <div class="flex flex-col items-center gap-3 py-4">
                    <Loader2 v-if="e2eeStore.isSettingUp" class="text-primary h-6 w-6 animate-spin" />
                    <p class="text-muted-foreground text-sm">Generating your encryption keys...</p>
                </div>

                <p v-if="e2eeStore.error" class="text-destructive text-sm">
                    <AlertCircle class="mr-1 inline h-4 w-4" />
                    {{ e2eeStore.error }}
                    <Button variant="link" class="ml-2 h-auto p-0 text-sm" @click="autoSetup"> Retry </Button>
                </p>
            </div>

            <!-- Done -->
            <div v-else-if="step === 'done'" class="bg-card space-y-4 rounded-lg border p-6 text-center">
                <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                    <CheckCircle2 class="h-6 w-6 text-green-500" />
                </div>
                <h2 class="font-semibold">You're All Set!</h2>
                <p class="text-muted-foreground text-sm">
                    End-to-end encryption is active. Your messages are now secured.
                </p>
            </div>
        </div>
    </div>

    <!-- Key Backup Dialog -->
    <KeyBackupDialog
        v-if="showBackupDialog"
        :open="showBackupDialog"
        @close="handleBackupClose"
        @complete="handleBackupComplete"
    />
</template>
