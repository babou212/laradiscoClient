<script setup lang="ts">
import { useClipboard } from '@vueuse/core';
import { Check, Copy, Laptop } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import apiClient from '@/api/client';
import { Button } from '@/components/ui/button';
import { formatLocalizedDateTime } from '@/lib/utils';
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

interface DeviceRow {
    device_id: string;
    device_name: string | null;
    platform: string | null;
    last_seen_at: string | null;
    created_at: string;
    is_current: boolean;
}

const devices = ref<DeviceRow[]>([]);
const devicesError = ref<string | null>(null);
const revokeTarget = ref<DeviceRow | null>(null);
const revokePassword = ref('');
const revokeError = ref<string | null>(null);
const ownDeviceId = ref('');

const { copy, copied } = useClipboard();

onMounted(async () => {
    requireVerification.value = await window.api.mls.getRequireVerification();
    ownDeviceId.value = (await window.api.mls.status()).deviceId;
    await loadDevices();
});

async function loadDevices(): Promise<void> {
    devicesError.value = null;
    try {
        const res = await apiClient.get<{ data: DeviceRow[] }>('/e2ee/devices');
        devices.value = res.data.data;
    } catch {
        devicesError.value = 'Could not load your devices. Please try again.';
    }
}

function isOwnDevice(device: DeviceRow): boolean {
    return device.is_current || device.device_id === ownDeviceId.value;
}

function startRevoke(device: DeviceRow): void {
    if (isOwnDevice(device)) return;
    revokeTarget.value = device;
    revokePassword.value = '';
    revokeError.value = null;
}

async function confirmRevoke(): Promise<void> {
    const target = revokeTarget.value;
    if (!target || busy.value || !revokePassword.value) return;
    busy.value = true;
    revokeError.value = null;
    try {
        await apiClient.delete(`/e2ee/devices/${target.device_id}`, {
            data: { password: revokePassword.value },
        });
        revokeTarget.value = null;
        await loadDevices();
    } catch (err) {
        const status = (err as { response?: { status?: number } }).response?.status;
        revokeError.value = status === 422 ? 'Incorrect password.' : 'Could not revoke the device. Please try again.';
    } finally {
        busy.value = false;
        revokePassword.value = '';
    }
}

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

        <!-- Devices -->
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h3 class="font-semibold">Your devices</h3>
                <p class="text-muted-foreground mt-1 text-sm">
                    Devices with access to your encrypted messages. Revoke any device you don't recognise — it will be
                    signed out and its encryption keys destroyed.
                </p>
            </div>

            <div class="divide-y px-6">
                <p v-if="devicesError" class="py-4 text-sm text-red-600">{{ devicesError }}</p>
                <p v-else-if="devices.length === 0" class="text-muted-foreground py-4 text-sm">No devices found.</p>

                <div v-for="device in devices" :key="device.device_id" class="py-4">
                    <div class="flex items-center justify-between gap-4">
                        <div class="flex min-w-0 items-center gap-3">
                            <Laptop class="text-muted-foreground size-5 shrink-0" />
                            <div class="min-w-0">
                                <p class="truncate text-sm font-medium">
                                    {{ device.device_name || 'Unknown device' }}
                                    <span
                                        v-if="isOwnDevice(device)"
                                        class="bg-primary/10 text-primary ml-2 rounded-full px-2 py-0.5 text-xs font-medium"
                                    >
                                        This device
                                    </span>
                                </p>
                                <p class="text-muted-foreground text-xs">
                                    <span v-if="device.platform">{{ device.platform }} · </span>
                                    Added {{ formatLocalizedDateTime(device.created_at) }}
                                    <span v-if="device.last_seen_at">
                                        · Last seen {{ formatLocalizedDateTime(device.last_seen_at) }}
                                    </span>
                                </p>
                            </div>
                        </div>
                        <Button
                            v-if="!isOwnDevice(device) && revokeTarget?.device_id !== device.device_id"
                            variant="destructive"
                            size="sm"
                            :disabled="busy"
                            @click="startRevoke(device)"
                        >
                            Revoke
                        </Button>
                    </div>

                    <div
                        v-if="revokeTarget?.device_id === device.device_id"
                        class="bg-muted mt-3 rounded-md border p-4"
                    >
                        <p class="text-sm font-medium">
                            Revoke this device? It will be signed out and its encryption keys destroyed.
                        </p>
                        <input
                            v-model="revokePassword"
                            type="password"
                            autocomplete="current-password"
                            placeholder="Confirm your account password"
                            class="border-input bg-background mt-3 w-full rounded-md border px-3 py-2 text-sm"
                            @keyup.enter="confirmRevoke"
                        />
                        <p v-if="revokeError" class="mt-2 text-sm text-red-600">{{ revokeError }}</p>
                        <div class="mt-3 flex gap-2">
                            <Button
                                variant="destructive"
                                size="sm"
                                :disabled="busy || !revokePassword"
                                @click="confirmRevoke"
                            >
                                Revoke device
                            </Button>
                            <Button variant="outline" size="sm" :disabled="busy" @click="revokeTarget = null">
                                Cancel
                            </Button>
                        </div>
                    </div>
                </div>
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
