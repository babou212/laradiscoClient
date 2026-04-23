import { ipcMain, powerMonitor } from 'electron';
import { hasCachedBackupKey } from './backup';
import { getDirtyServerIds } from './index';

const AUTO_BACKUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

let backupTimer: ReturnType<typeof setInterval> | null = null;
let wasRunningBeforeSuspend = false;
const lastBackupTimestamps = new Map<number, number>();

powerMonitor.on('suspend', () => {
    wasRunningBeforeSuspend = backupTimer !== null;
    stopAutoBackup();
});
powerMonitor.on('resume', () => {
    if (wasRunningBeforeSuspend) startAutoBackup();
});

/**
 * Start the periodic auto-backup timer.
 * On each tick, checks all servers for dirty state and triggers backup
 * if a cached PIN-derived key is available.
 */
export function startAutoBackup(): void {
    if (backupTimer) return;

    backupTimer = setInterval(async () => {
        const dirtyIds = getDirtyServerIds();
        for (const serverId of dirtyIds) {
            if (!hasCachedBackupKey(serverId)) continue;

            try {
                const result = await ipcMain.emit('mls:autoUpdateBackup', serverId);

                if (result) {
                    lastBackupTimestamps.set(serverId, Date.now());
                }
            } catch (err) {
                console.error(`[AutoBackup] Failed for server ${serverId}:`, err);
            }
        }
    }, AUTO_BACKUP_INTERVAL_MS);
}

/**
 * Stop the periodic auto-backup timer.
 */
export function stopAutoBackup(): void {
    if (backupTimer) {
        clearInterval(backupTimer);
        backupTimer = null;
    }
}

/**
 * Get the last successful backup timestamp for a server.
 */
export function getLastBackupTimestamp(serverId: number): number | null {
    return lastBackupTimestamps.get(serverId) ?? null;
}

export function setLastBackupTimestamp(serverId: number, timestamp: number): void {
    lastBackupTimestamps.set(serverId, timestamp);
}

/**
 * Register auto-backup IPC handlers.
 */
export function registerAutoBackupHandlers(): void {
    ipcMain.handle('mls:startAutoBackup', async () => {
        startAutoBackup();
        return { success: true };
    });

    ipcMain.handle('mls:stopAutoBackup', async () => {
        stopAutoBackup();
        return { success: true };
    });

    ipcMain.handle('mls:getLastBackupTimestamp', async (_event, serverId: number) => {
        return getLastBackupTimestamp(serverId);
    });

    ipcMain.handle('mls:setLastBackupTimestamp', async (_event, serverId: number, timestamp: number) => {
        setLastBackupTimestamp(serverId, timestamp);
        return { success: true };
    });
}
