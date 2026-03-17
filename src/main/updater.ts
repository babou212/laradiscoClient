import { BrowserWindow, ipcMain } from 'electron';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;
import { is } from '@electron-toolkit/utils';

export function initAutoUpdater(): void {
    if (is.dev) return;

    autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'babou212',
        repo: 'laradiscoClient',
    });

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
            win.webContents.send('updater:update-available', {
                version: info.version,
                releaseNotes: info.releaseNotes,
            });
        }
    });

    autoUpdater.on('update-not-available', () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
            win.webContents.send('updater:up-to-date');
        }
    });

    autoUpdater.on('download-progress', (progress) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
            win.webContents.send('updater:download-progress', {
                percent: progress.percent,
                bytesPerSecond: progress.bytesPerSecond,
                transferred: progress.transferred,
                total: progress.total,
            });
        }
    });

    autoUpdater.on('update-downloaded', () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
            win.webContents.send('updater:update-downloaded');
        }
    });

    autoUpdater.on('error', (error) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
            win.webContents.send('updater:error', error.message);
        }
    });

    ipcMain.handle('updater:check', async () => {
        try {
            const result = await autoUpdater.checkForUpdates();
            return { success: true, version: result?.updateInfo.version };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle('updater:download', async () => {
        try {
            await autoUpdater.downloadUpdate();
            return { success: true };
        } catch (error) {
            return { success: false, error: (error as Error).message };
        }
    });

    ipcMain.handle('updater:install', () => {
        autoUpdater.quitAndInstall();
    });

    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 30_000);
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
}
