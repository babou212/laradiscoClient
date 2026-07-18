<script setup lang="ts">
import { useClipboard } from '@vueuse/core';
import { Check, Copy } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth';
import { useServerStore } from '@/stores/server';

const { t } = useI18n();
const authStore = useAuthStore();
const serverStore = useServerStore();

const recoveryCode = ref<string | null>(null);
const restoreCode = ref('');
const busy = ref(false);
const backupStatus = ref<{ ok: boolean; message: string } | null>(null);
const restoreStatus = ref<{ ok: boolean; message: string } | null>(null);
const requireVerification = ref(false);

const { copy, copied } = useClipboard();

onMounted(async () => {
    requireVerification.value = await window.api.mls.getRequireVerification();
});

async function toggleRequireVerification(): Promise<void> {
    requireVerification.value = !requireVerification.value;
    await window.api.mls.setRequireVerification(requireVerification.value);
}

function creds(): { host: string; token: string } | null {
    const host = serverStore.activeHost;
    const token = authStore.token;
    return host && token ? { host, token } : null;
}

async function createBackup(): Promise<void> {
    const c = creds();
    if (!c || busy.value) return;
    busy.value = true;
    backupStatus.value = null;
    try {
        const code = await window.api.mls.newRecoveryCode();
        await window.api.mls.backup(c.host, c.token, code);
        recoveryCode.value = code;
        backupStatus.value = {
            ok: true,
            message:
                'Backup created and now kept up to date automatically. Save your recovery code — it is shown only once.',
        };
    } catch {
        backupStatus.value = { ok: false, message: 'Backup failed. Please try again.' };
    } finally {
        busy.value = false;
    }
}

async function restoreBackup(): Promise<void> {
    const c = creds();
    const code = restoreCode.value.trim();
    if (!c || !code || busy.value) return;
    busy.value = true;
    restoreStatus.value = null;
    try {
        await window.api.mls.restore(c.host, c.token, code);
        restoreStatus.value = {
            ok: true,
            message: 'Backup restored. Your encrypted message history is available on this device.',
        };
        restoreCode.value = '';
    } catch {
        restoreStatus.value = { ok: false, message: 'Restore failed. Check the recovery code and try again.' };
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <div class="space-y-6">
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">{{ t('settings.security.title') }}</h2>
                <p class="text-muted-foreground mt-1 text-sm">{{ t('settings.security.description') }}</p>
            </div>
        </div>

        <!-- Contact verification -->
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h3 class="font-semibold">Contact verification</h3>
                <p class="text-muted-foreground mt-1 text-sm">
                    Compare a contact's safety number (shield icon in a chat) to be sure no one is intercepting your
                    messages. You can require verification before any message is sent.
                </p>
            </div>
            <div class="flex items-center justify-between px-6 py-4">
                <div>
                    <p class="text-sm font-medium">Require verification before sending</p>
                    <p class="text-muted-foreground text-xs">Blocks sending to contacts you haven't verified.</p>
                </div>
                <button
                    type="button"
                    role="switch"
                    :aria-checked="requireVerification"
                    class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                    :class="requireVerification ? 'bg-primary' : 'bg-muted'"
                    @click="toggleRequireVerification"
                >
                    <span
                        class="bg-background inline-block h-5 w-5 transform rounded-full shadow transition-transform"
                        :class="requireVerification ? 'translate-x-5' : 'translate-x-0.5'"
                    />
                </button>
            </div>
        </div>

        <!-- Encrypted message backup -->
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h3 class="font-semibold">Encrypted message backup</h3>
                <p class="text-muted-foreground mt-1 text-sm">
                    Your direct messages are end-to-end encrypted. Back up your keys and history so you can read past
                    messages on a new device. Once created, the backup updates automatically as new messages arrive. It
                    is protected by a recovery code that only you hold — keep it safe.
                </p>
            </div>

            <div class="space-y-6 px-6 py-4">
                <!-- Create backup -->
                <div class="space-y-3">
                    <Button :disabled="busy" @click="createBackup">Create / update backup</Button>

                    <div v-if="recoveryCode" class="bg-muted rounded-md border p-4">
                        <p class="text-sm font-medium">Your recovery code (shown once):</p>
                        <code class="mt-2 block font-mono text-sm break-all select-all">{{ recoveryCode }}</code>
                        <Button variant="outline" size="sm" class="mt-2" @click="copy(recoveryCode)">
                            <Check v-if="copied" class="size-4 text-green-500" />
                            <Copy v-else class="size-4" />
                            {{ copied ? 'Copied' : 'Copy recovery code' }}
                        </Button>
                        <p class="text-muted-foreground mt-2 text-xs">
                            Store this somewhere safe. Without it, an encrypted backup cannot be recovered.
                        </p>
                    </div>

                    <p v-if="backupStatus" class="text-sm" :class="backupStatus.ok ? 'text-green-600' : 'text-red-600'">
                        {{ backupStatus.message }}
                    </p>
                </div>

                <!-- Restore backup -->
                <div class="space-y-3 border-t pt-4">
                    <label class="text-sm font-medium" for="mls-restore-code">Restore on this device</label>
                    <input
                        id="mls-restore-code"
                        v-model="restoreCode"
                        type="text"
                        autocomplete="off"
                        spellcheck="false"
                        placeholder="Enter your recovery code"
                        class="border-input bg-background w-full rounded-md border px-3 py-2 font-mono text-sm"
                    />
                    <Button variant="outline" :disabled="busy || !restoreCode.trim()" @click="restoreBackup">
                        Restore from backup
                    </Button>

                    <p
                        v-if="restoreStatus"
                        class="text-sm"
                        :class="restoreStatus.ok ? 'text-green-600' : 'text-red-600'"
                    >
                        {{ restoreStatus.message }}
                    </p>
                </div>
            </div>
        </div>
    </div>
</template>
