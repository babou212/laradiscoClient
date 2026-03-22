import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useE2EE } from '@/composables/useE2EE';

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

    let maintenanceInterval: ReturnType<typeof setInterval> | null = null;

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
        } catch (err: any) {
            error.value = err.response?.data?.message ?? err.message ?? 'Setup failed';
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

            return true;
        } catch (err: any) {
            error.value = err.response?.data?.message ?? err.message ?? 'Device setup failed';
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
                error.value = result.error ?? 'Restore failed — check your PIN';
                return false;
            }
            return true;
        } catch (err: any) {
            error.value = err.message ?? 'Restore failed';
            return false;
        }
    }

    async function createBackup(pin: string): Promise<boolean> {
        error.value = null;
        try {
            await e2ee.backupKeys(pin);
            hasBackup.value = true;
            return true;
        } catch (err: any) {
            error.value = err.message ?? 'Backup failed';
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
            devices.value = result.map((d: any) => ({
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
        } catch (err: any) {
            error.value = err.message ?? 'Failed to revoke device';
            return false;
        }
    }

    async function renameDevice(targetDeviceId: string, name: string): Promise<boolean> {
        error.value = null;
        try {
            await e2ee.renameDevice(targetDeviceId, name);
            await loadDevices();
            return true;
        } catch (err: any) {
            error.value = err.message ?? 'Failed to rename device';
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

    async function deleteBackup(): Promise<boolean> {
        error.value = null;
        try {
            await e2ee.deleteBackup();
            hasBackup.value = false;
            return true;
        } catch (err: any) {
            error.value = err.message ?? 'Failed to delete backup';
            return false;
        }
    }

    async function wipeKeys(): Promise<void> {
        await e2ee.wipe();
        isReady.value = false;
        deviceId.value = null;
        devices.value = [];
        setupStep.value = 'check';
    }

    function $reset(): void {
        isReady.value = false;
        isSettingUp.value = false;
        hasBackup.value = false;
        deviceId.value = null;
        devices.value = [];
        error.value = null;
        setupStep.value = 'check';
        if (maintenanceInterval) {
            clearInterval(maintenanceInterval);
            maintenanceInterval = null;
        }
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
        initialize,
        performSetup,
        performDeviceSetup,
        restoreFromBackup,
        createBackup,
        checkBackup,
        loadDevices,
        revokeDevice,
        renameDevice,
        performMaintenance,
        deleteBackup,
        wipeKeys,
        $reset,
    };
});
