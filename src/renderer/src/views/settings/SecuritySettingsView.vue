<script setup lang="ts">
import {
    Shield,
    ShieldCheck,
    Monitor,
    Trash2,
    Pencil,
    Key,
    AlertTriangle,
    Loader2,
    ScrollText,
    ChevronDown,
    ChevronUp,
} from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getAuditLog } from '@/api/e2ee';
import KeyBackupDialog from '@/components/e2ee/KeyBackupDialog.vue';
import { Badge } from '@/components/ui/badge';
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
import { useAuthStore } from '@/stores/auth';
import { useE2eeStore, type E2eeDevice } from '@/stores/e2ee';

const e2eeStore = useE2eeStore();
const authStore = useAuthStore();

const isLoading = ref(true);
const showRevokeDialog = ref(false);
const showRenameDialog = ref(false);
const showBackupDialog = ref(false);
const showWipeDialog = ref(false);
const targetDevice = ref<E2eeDevice | null>(null);
const newDeviceName = ref('');
const processing = ref(false);

type AuditEntry = {
    id: number;
    event_type: string;
    device_id: string | null;
    public_key: string | null;
    metadata: Record<string, unknown> | null;
    previous_hash: string | null;
    entry_hash: string | null;
    created_at: string | null;
};
const auditLog = ref<AuditEntry[]>([]);
const auditLogLoading = ref(false);
const auditLogExpanded = ref(false);

async function loadAuditLog() {
    const userId = authStore.user?.id;
    if (!userId) return;
    auditLogLoading.value = true;
    try {
        auditLog.value = (await getAuditLog(userId)) as AuditEntry[];
    } catch {
        auditLog.value = [];
    } finally {
        auditLogLoading.value = false;
    }
}

function eventLabel(eventType: string): string {
    const labels: Record<string, string> = {
        identity_created: 'Identity Created',
        device_registered: 'Device Registered',
        device_revoked: 'Device Revoked',
        backup_created: 'Key Backup Created',
        backup_restored: 'Key Backup Restored',
        key_package_uploaded: 'Key Packages Uploaded',
        signed_prekey_rotated: 'Signed Prekey Rotated',
    };
    return labels[eventType] ?? eventType.replace(/_/g, ' ');
}

onMounted(async () => {
    await Promise.all([e2eeStore.loadDevices(), e2eeStore.checkBackup()]);
    isLoading.value = false;
});

function confirmRevoke(device: E2eeDevice) {
    targetDevice.value = device;
    showRevokeDialog.value = true;
}

async function handleRevoke() {
    if (!targetDevice.value) return;
    processing.value = true;
    await e2eeStore.revokeDevice(targetDevice.value.device_id);
    processing.value = false;
    showRevokeDialog.value = false;
    targetDevice.value = null;
}

function startRename(device: E2eeDevice) {
    targetDevice.value = device;
    newDeviceName.value = device.device_name;
    showRenameDialog.value = true;
}

async function handleRename() {
    if (!targetDevice.value || !newDeviceName.value.trim()) return;
    processing.value = true;
    await e2eeStore.renameDevice(targetDevice.value.device_id, newDeviceName.value.trim());
    processing.value = false;
    showRenameDialog.value = false;
    targetDevice.value = null;
}

const router = useRouter();

async function handleWipe() {
    processing.value = true;
    await e2eeStore.wipeKeys();
    processing.value = false;
    showWipeDialog.value = false;
    router.replace({ name: 'e2ee-setup' });
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
</script>

<template>
    <div class="space-y-6">
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">Encryption</h2>
                <p class="text-muted-foreground mt-1 text-sm">Manage your end-to-end encryption settings</p>
            </div>

            <div class="p-6">
                <div class="flex items-center gap-3">
                    <div
                        :class="[
                            'flex h-10 w-10 items-center justify-center rounded-full',
                            e2eeStore.isReady ? 'bg-green-500/10' : 'bg-destructive/10',
                        ]"
                    >
                        <ShieldCheck v-if="e2eeStore.isReady" class="h-5 w-5 text-green-500" />
                        <Shield v-else class="text-destructive h-5 w-5" />
                    </div>
                    <div>
                        <p class="font-medium">
                            {{ e2eeStore.isReady ? 'Encryption Active' : 'Encryption Not Set Up' }}
                        </p>
                        <p class="text-muted-foreground text-sm">
                            {{
                                e2eeStore.isReady
                                    ? 'Your messages are end-to-end encrypted.'
                                    : 'Set up encryption to secure your messages.'
                            }}
                        </p>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="e2eeStore.isReady" class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">Key Backup</h2>
                <p class="text-muted-foreground mt-1 text-sm">
                    Back up your keys to use encryption on multiple devices
                </p>
            </div>

            <div class="p-6">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <Key class="text-muted-foreground h-5 w-5" />
                        <div>
                            <p class="font-medium">
                                {{ e2eeStore.hasBackup ? 'Backup Exists' : 'No Backup' }}
                            </p>
                            <p class="text-muted-foreground text-sm">
                                {{
                                    e2eeStore.hasBackup
                                        ? 'Your keys are backed up and can be restored on new devices.'
                                        : 'Create a backup to use encryption on other devices.'
                                }}
                            </p>
                        </div>
                    </div>
                    <Button
                        :variant="e2eeStore.hasBackup ? 'outline' : 'default'"
                        size="sm"
                        @click="showBackupDialog = true"
                    >
                        {{ e2eeStore.hasBackup ? 'Update Backup' : 'Create Backup' }}
                    </Button>
                </div>
            </div>
        </div>

        <div v-if="e2eeStore.isReady" class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-lg font-semibold">Devices</h2>
                        <p class="text-muted-foreground mt-1 text-sm">
                            Manage devices linked to your encryption identity
                        </p>
                    </div>
                </div>
            </div>

            <div class="p-6">
                <div v-if="isLoading" class="flex justify-center py-4">
                    <Loader2 class="text-muted-foreground h-6 w-6 animate-spin" />
                </div>

                <div v-else-if="e2eeStore.devices.length === 0" class="text-muted-foreground py-4 text-center text-sm">
                    No devices found.
                </div>

                <div v-else class="space-y-3">
                    <div
                        v-for="device in e2eeStore.devices"
                        :key="device.device_id"
                        class="flex items-center justify-between rounded-md border p-3"
                    >
                        <div class="flex items-center gap-3">
                            <Monitor class="text-muted-foreground h-5 w-5" />
                            <div>
                                <div class="flex items-center gap-2">
                                    <p class="font-medium">{{ device.device_name }}</p>
                                    <Badge v-if="device.is_current" variant="secondary" class="text-xs">
                                        This device
                                    </Badge>
                                </div>
                                <p class="text-muted-foreground text-xs">Added {{ formatDate(device.created_at) }}</p>
                            </div>
                        </div>

                        <div v-if="!device.is_current" class="flex gap-1">
                            <Button variant="ghost" size="sm" @click="startRename(device)">
                                <Pencil class="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                class="text-destructive hover:text-destructive"
                                @click="confirmRevoke(device)"
                            >
                                <Trash2 class="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="e2eeStore.isReady" class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <div class="flex items-center justify-between">
                    <div>
                        <h2 class="text-lg font-semibold">Audit Log</h2>
                        <p class="text-muted-foreground mt-1 text-sm">
                            Key transparency log — cryptographic record of all encryption events
                        </p>
                    </div>
                    <div class="flex gap-1">
                        <Button variant="ghost" size="sm" @click="auditLogExpanded = !auditLogExpanded">
                            <ChevronUp v-if="auditLogExpanded" class="h-4 w-4" />
                            <ChevronDown v-else class="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <div v-if="auditLogExpanded" class="p-6">
                <div v-if="auditLogLoading" class="flex justify-center py-4">
                    <Loader2 class="text-muted-foreground h-6 w-6 animate-spin" />
                </div>

                <div v-else-if="auditLog.length === 0" class="text-muted-foreground py-4 text-center text-sm">
                    <Button variant="outline" size="sm" @click="loadAuditLog"> Load audit log </Button>
                </div>

                <div v-else class="max-h-80 space-y-2 overflow-y-auto">
                    <div v-for="entry in auditLog" :key="entry.id" class="rounded-md border p-3 text-sm">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <ScrollText class="text-muted-foreground h-4 w-4" />
                                <span class="font-medium">{{ eventLabel(entry.event_type) }}</span>
                            </div>
                            <span class="text-muted-foreground text-xs">
                                {{ entry.created_at ? formatDate(entry.created_at) : '' }}
                            </span>
                        </div>
                        <div v-if="entry.device_id" class="text-muted-foreground mt-1 text-xs">
                            Device: <code class="bg-muted rounded px-1">{{ entry.device_id.slice(0, 16) }}...</code>
                        </div>
                        <div v-if="entry.entry_hash" class="text-muted-foreground mt-1 text-xs">
                            Hash: <code class="bg-muted rounded px-1">{{ entry.entry_hash.slice(0, 16) }}...</code>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="e2eeStore.isReady" class="border-destructive/50 bg-card rounded-lg border">
            <div class="border-destructive/50 bg-destructive/5 border-b px-6 py-4">
                <h2 class="text-destructive text-lg font-semibold">Danger Zone</h2>
            </div>

            <div class="p-6">
                <div class="flex items-center justify-between">
                    <div>
                        <p class="font-medium">Reset Encryption</p>
                        <p class="text-muted-foreground text-sm">
                            Delete all local encryption keys. You will need to set up encryption again.
                        </p>
                    </div>
                    <Button variant="destructive" size="sm" @click="showWipeDialog = true"> Reset </Button>
                </div>
            </div>
        </div>

        <Dialog
            :open="showRevokeDialog"
            @update:open="
                (v) => {
                    if (!v) showRevokeDialog = false;
                }
            "
        >
            <DialogContent class="max-w-md">
                <DialogHeader>
                    <DialogTitle>Revoke Device</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to revoke <strong>{{ targetDevice?.device_name }}</strong
                        >? This device will no longer be able to decrypt new messages.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="ghost" @click="showRevokeDialog = false">Cancel</Button>
                    <Button variant="destructive" :disabled="processing" @click="handleRevoke">
                        <Loader2 v-if="processing" class="mr-2 h-4 w-4 animate-spin" />
                        Revoke
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog
            :open="showRenameDialog"
            @update:open="
                (v) => {
                    if (!v) showRenameDialog = false;
                }
            "
        >
            <DialogContent class="max-w-md">
                <DialogHeader>
                    <DialogTitle>Rename Device</DialogTitle>
                    <DialogDescription> Enter a new name for this device. </DialogDescription>
                </DialogHeader>
                <div class="py-2">
                    <Input v-model="newDeviceName" placeholder="Device name" @keydown.enter="handleRename" />
                </div>
                <DialogFooter>
                    <Button variant="ghost" @click="showRenameDialog = false">Cancel</Button>
                    <Button :disabled="!newDeviceName.trim() || processing" @click="handleRename">
                        <Loader2 v-if="processing" class="mr-2 h-4 w-4 animate-spin" />
                        Rename
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <Dialog
            :open="showWipeDialog"
            @update:open="
                (v) => {
                    if (!v) showWipeDialog = false;
                }
            "
        >
            <DialogContent class="max-w-md">
                <DialogHeader>
                    <DialogTitle class="text-destructive flex items-center gap-2">
                        <AlertTriangle class="h-5 w-5" />
                        Reset Encryption
                    </DialogTitle>
                    <DialogDescription>
                        This will permanently delete all encryption keys from this device. You will lose the ability to
                        decrypt existing messages unless you have a key backup. This action cannot be undone.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="ghost" @click="showWipeDialog = false">Cancel</Button>
                    <Button variant="destructive" :disabled="processing" @click="handleWipe">
                        <Loader2 v-if="processing" class="mr-2 h-4 w-4 animate-spin" />
                        Delete All Keys
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <KeyBackupDialog
            v-if="showBackupDialog"
            :open="showBackupDialog"
            @close="showBackupDialog = false"
            @complete="showBackupDialog = false"
        />
    </div>
</template>
