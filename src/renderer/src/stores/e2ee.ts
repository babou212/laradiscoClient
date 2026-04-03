import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useE2EE } from '@/composables/useE2EE';
import { getEcho } from '@/lib/echo';
import { useAuthStore } from '@/stores/auth';
import { getApiErrorMessage } from '@/api/errors';

export interface E2eeDevice {
    id: number;
    device_id: string;
    device_name: string;
    is_current?: boolean;
    created_at: string;
    last_active_at: string | null;
}

export const useE2eeStore = defineStore('e2ee', () => {
    const e2ee = useE2EE();

    const isReady = ref(false);

    const isSettingUp = ref(false);

    const hasBackup = ref(false);

    const deviceId = ref<string | null>(null);

    const devices = ref<E2eeDevice[]>([]);

    const error = ref<string | null>(null);

    const setupStep = ref<'check' | 'restore' | 'setup' | 'backup' | 'done'>('check');

    const needsSetup = computed(() => !isReady.value && !isSettingUp.value);

    const lastBackupAt = ref<string | null>(null);

    const backupLocked = ref(false);

    const isBackupStale = computed(() => {
        if (!lastBackupAt.value) return true;
        const lastBackup = new Date(lastBackupAt.value).getTime();
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        return lastBackup < oneDayAgo;
    });

    let maintenanceInterval: ReturnType<typeof setInterval> | null = null;
    let autoBackupInterval: ReturnType<typeof setInterval> | null = null;
    let deviceAddedChannelName: string | null = null;

    function listenForDeviceAdded(): void {
        const authStore = useAuthStore();
        const userId = authStore.user?.id;
        if (!userId) return;

        const echo = getEcho();
        if (!echo) return;

        deviceAddedChannelName = `App.Models.User.${userId}`;
        echo.private(deviceAddedChannelName)
            .listen('DeviceAdded', async (data: { user_id: number; device_id: string; device_name: string | null }) => {
                if (!isReady.value) return;
                if (data.device_id === deviceId.value) return;

                console.log('[E2EE] New device detected, enrolling:', data.device_id);
                try {
                    await e2ee.enrollNewDevice(data.device_id);
                } catch (error) {
                    console.error('[E2EE] Failed to enroll new device:', error);
                }
            })
            .listen(
                'MlsJoinRequested',
                async (data: { group_id: string; requester_user_id: number; requester_device_id: string }) => {
                    if (!isReady.value) return;

                    console.log(
                        '[E2EE] Join request received for group:',
                        data.group_id,
                        'from device:',
                        data.requester_device_id,
                    );
                    try {
                        await e2ee.handleJoinRequest(data.group_id, data.requester_user_id, data.requester_device_id);
                    } catch (error) {
                        console.error('[E2EE] Failed to handle join request:', error);
                    }
                },
            )
            .listen('MlsWelcomeReady', async (data: { device_id: string; group_id: string }) => {
                if (!isReady.value) return;
                if (data.device_id && data.device_id !== deviceId.value) return;

                console.log('[E2EE] Welcome ready for group:', data.group_id);
                try {
                    await e2ee.handleWelcome();
                } catch (error) {
                    console.error('[E2EE] Failed to handle welcome:', error);
                }
            });
    }

    function stopListeningForDeviceAdded(): void {
        if (deviceAddedChannelName) {
            try {
                const echo = getEcho();
                echo?.private(deviceAddedChannelName)
                    .stopListening('DeviceAdded')
                    .stopListening('MlsJoinRequested')
                    .stopListening('MlsWelcomeReady');
            } catch {
                // Echo may already be disconnected
            }
            deviceAddedChannelName = null;
        }
    }

    async function initialize(): Promise<void> {
        try {
            error.value = null;

            await e2ee.wipeIfUserChanged();

            const setup = await e2ee.isSetup();
            isReady.value = setup;

            if (setup) {
                deviceId.value = await e2ee.getDeviceId();
                await e2ee.ensureDeviceRegistered();
                performMaintenance();

                if (maintenanceInterval) clearInterval(maintenanceInterval);
                maintenanceInterval = setInterval(
                    () => {
                        performMaintenance();
                    },
                    6 * 60 * 60 * 1000,
                );

                startAutoBackupTimer();
                listenForDeviceAdded();
            }
        } catch {
            isReady.value = false;
        }
    }

    async function performSetup(deviceName: string): Promise<boolean> {
        isSettingUp.value = true;
        error.value = null;
        try {
            const result = await e2ee.setup(deviceName);
            deviceId.value = result.deviceId;
            isReady.value = true;
            return true;
        } catch (err: unknown) {
            error.value = getApiErrorMessage(err);
            return false;
        } finally {
            isSettingUp.value = false;
        }
    }

    async function performDeviceSetup(deviceName: string): Promise<boolean> {
        isSettingUp.value = true;
        error.value = null;
        try {
            const result = await e2ee.setupDevice(deviceName);
            deviceId.value = result.deviceId;
            isReady.value = true;
            setupStep.value = 'done';

            performMaintenance();
            if (maintenanceInterval) clearInterval(maintenanceInterval);
            maintenanceInterval = setInterval(
                () => {
                    performMaintenance();
                },
                6 * 60 * 60 * 1000,
            );

            listenForDeviceAdded();
            startAutoBackupTimer();

            try {
                await e2ee.handleWelcome();
            } catch {
                // Non-fatal — welcomes will arrive via SSE
            }

            return true;
        } catch (err: unknown) {
            error.value = getApiErrorMessage(err);
            return false;
        } finally {
            isSettingUp.value = false;
        }
    }

    async function restoreFromBackup(pin: string): Promise<boolean> {
        error.value = null;
        try {
            const result = await e2ee.restoreKeys(pin);
            if (!result.success) {
                if (result.error?.includes('locked')) {
                    backupLocked.value = true;
                }
                error.value = result.error ?? 'Restore failed — check your PIN';
                return false;
            }
            backupLocked.value = false;
            return true;
        } catch (err: unknown) {
            const axiosErr = err as { response?: { status?: number }; message?: string };
            if (axiosErr.response?.status === 423 || axiosErr.message?.includes('locked')) {
                backupLocked.value = true;
            }
            error.value = err instanceof Error ? err.message : 'Restore failed';
            return false;
        }
    }

    async function unlockBackup(twoFactorCode: string): Promise<boolean> {
        error.value = null;
        try {
            const result = await e2ee.unlockBackup(twoFactorCode);
            if (result.success) {
                backupLocked.value = false;
                return true;
            }
            error.value = result.error ?? 'Unlock failed';
            return false;
        } catch (err: unknown) {
            error.value = err instanceof Error ? err.message : 'Unlock failed';
            return false;
        }
    }

    async function createBackup(pin: string): Promise<boolean> {
        error.value = null;
        try {
            await e2ee.backupKeys(pin);
            hasBackup.value = true;
            return true;
        } catch (err: unknown) {
            error.value = err instanceof Error ? err.message : 'Backup failed';
            return false;
        }
    }

    async function checkBackup(): Promise<boolean> {
        try {
            hasBackup.value = await e2ee.backupExists();
            return hasBackup.value;
        } catch {
            return false;
        }
    }

    async function loadDevices(): Promise<void> {
        try {
            const result = await e2ee.fetchDevices();
            devices.value = result.map((d) => ({
                ...d,
                is_current: d.device_id === deviceId.value,
            }));
        } catch (err) {
            console.error('Failed to load devices:', err);
        }
    }

    async function revokeDevice(targetDeviceId: string): Promise<boolean> {
        error.value = null;
        try {
            await e2ee.revokeDevice(targetDeviceId);
            await loadDevices();
            return true;
        } catch (err: unknown) {
            error.value = err instanceof Error ? err.message : 'Failed to revoke device';
            return false;
        }
    }

    async function renameDevice(targetDeviceId: string, name: string): Promise<boolean> {
        error.value = null;
        try {
            await e2ee.renameDevice(targetDeviceId, name);
            await loadDevices();
            return true;
        } catch (err: unknown) {
            error.value = err instanceof Error ? err.message : 'Failed to rename device';
            return false;
        }
    }

    async function performMaintenance(): Promise<void> {
        try {
            await e2ee.checkAndReplenishKeyPackages();
        } catch (err) {
            console.error('Key package replenishment failed:', err);
        }
    }

    function startAutoBackupTimer(): void {
        if (autoBackupInterval) clearInterval(autoBackupInterval);
        autoBackupInterval = setInterval(
            async () => {
                try {
                    const updated = await e2ee.autoUpdateBackup();
                    if (updated) {
                        lastBackupAt.value = new Date().toISOString();
                    }
                } catch (err) {
                    console.error('[E2EE] Auto-backup failed:', err);
                }
            },
            15 * 60 * 1000,
        );
    }

    function stopAutoBackupTimer(): void {
        if (autoBackupInterval) {
            clearInterval(autoBackupInterval);
            autoBackupInterval = null;
        }
    }

    async function deleteBackup(): Promise<boolean> {
        error.value = null;
        try {
            await e2ee.deleteBackup();
            hasBackup.value = false;
            return true;
        } catch (err: unknown) {
            error.value = err instanceof Error ? err.message : 'Failed to delete backup';
            return false;
        }
    }

    async function wipeKeys(): Promise<void> {
        stopAutoBackupTimer();
        await e2ee.clearBackupKey();
        await e2ee.wipe();
        isReady.value = false;
        deviceId.value = null;
        devices.value = [];
        setupStep.value = 'check';
    }

    async function changePIN(oldPin: string, newPin: string): Promise<boolean> {
        error.value = null;
        try {
            const result = await e2ee.changePIN(oldPin, newPin);
            if (!result.success) {
                error.value = result.error ?? 'PIN change failed';
                return false;
            }
            return true;
        } catch (err: unknown) {
            error.value = err instanceof Error ? err.message : 'PIN change failed';
            return false;
        }
    }

    function $reset(): void {
        isReady.value = false;
        isSettingUp.value = false;
        hasBackup.value = false;
        deviceId.value = null;
        devices.value = [];
        error.value = null;
        setupStep.value = 'check';
        lastBackupAt.value = null;
        backupLocked.value = false;
        if (maintenanceInterval) {
            clearInterval(maintenanceInterval);
            maintenanceInterval = null;
        }
        stopAutoBackupTimer();
        stopListeningForDeviceAdded();
    }

    return {
        isReady,
        isSettingUp,
        hasBackup,
        deviceId,
        devices,
        error,
        setupStep,
        needsSetup,
        lastBackupAt,
        backupLocked,
        isBackupStale,
        initialize,
        performSetup,
        performDeviceSetup,
        restoreFromBackup,
        unlockBackup,
        createBackup,
        checkBackup,
        loadDevices,
        revokeDevice,
        renameDevice,
        performMaintenance,
        deleteBackup,
        wipeKeys,
        changePIN,
        startAutoBackupTimer,
        stopAutoBackupTimer,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useE2eeStore, import.meta.hot));
}
