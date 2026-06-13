import { copyFile } from 'fs/promises';
import { BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import { getLogFilePath, logger } from './logger';

// Only frames loaded from the app's own origins may invoke IPC (defence-in-depth,
// mirrors the guard in ipc.ts / index.ts).
function isTrustedSender(event: IpcMainInvokeEvent): boolean {
    const url = event.senderFrame?.url ?? '';
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    return (
        url.startsWith('app://renderer') ||
        url.startsWith('http://localhost') ||
        url.startsWith('http://127.0.0.1') ||
        (!!devUrl && url.startsWith(devUrl))
    );
}

function handle<T extends unknown[], R>(
    channel: string,
    fn: (event: IpcMainInvokeEvent, ...args: T) => R | Promise<R>,
): void {
    ipcMain.handle(channel, (event, ...args) => {
        if (!isTrustedSender(event)) {
            throw new Error(`ipc ${channel}: untrusted sender`);
        }
        return fn(event, ...(args as T));
    });
}

export interface LogSaveResult {
    success: boolean;
    canceled?: boolean;
    error?: string;
}

export function registerLogIpcHandlers(): void {
    handle('log:getPath', () => getLogFilePath());

    handle('log:reveal', () => {
        shell.showItemInFolder(getLogFilePath());
        return { success: true };
    });

    handle('log:save', async (event): Promise<LogSaveResult> => {
        try {
            const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
            const result = await dialog.showSaveDialog(win!, {
                title: 'Save log file',
                defaultPath: `laradisco-${new Date().toISOString().slice(0, 10)}.log`,
                filters: [{ name: 'Log', extensions: ['log', 'txt'] }],
            });
            if (result.canceled || !result.filePath) {
                return { success: false, canceled: true };
            }
            await copyFile(getLogFilePath(), result.filePath);
            return { success: true };
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            logger.error('[ipc:log:save]', error);
            return { success: false, error: error.message };
        }
    });
}
