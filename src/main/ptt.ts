import { BrowserWindow, ipcMain } from 'electron';
import { uIOhook } from 'uiohook-napi';
import type { UiohookKeyboardEvent } from 'uiohook-napi';


interface PttConfig {
    keycode: number;
    requireCtrl: boolean;
    requireShift: boolean;
    requireAlt: boolean;
    requireMeta: boolean;
}

let pttConfig: PttConfig | null = null;
let pttEnabled = false;
let pttIsCurrentlyDown = false;
let hookStarted = false;

let keyUpDebounceTimer: ReturnType<typeof setTimeout> | null = null;

let keyCaptureResolve: ((result: {
    keycode: number;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
}) => void) | null = null;

function sendToAllWindows(channel: string, ...args: unknown[]): void {
    BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.isDestroyed()) {
            w.webContents.send(channel, ...args);
        }
    });
}

function eventMatchesConfig(e: UiohookKeyboardEvent, cfg: PttConfig): boolean {
    if (e.keycode !== cfg.keycode) return false;
    if (cfg.requireCtrl && !e.ctrlKey) return false;
    if (cfg.requireShift && !e.shiftKey) return false;
    if (cfg.requireAlt && !e.altKey) return false;
    if (cfg.requireMeta && !e.metaKey) return false;
    return true;
}

function onKeyDown(e: UiohookKeyboardEvent): void {
    if (keyCaptureResolve) {
        const resolve = keyCaptureResolve;
        keyCaptureResolve = null;
        resolve({
            keycode: e.keycode,
            ctrlKey: e.ctrlKey,
            shiftKey: e.shiftKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
        });
        return;
    }

    if (!pttEnabled || !pttConfig) return;
    if (!eventMatchesConfig(e, pttConfig)) return;

    if (keyUpDebounceTimer) {
        clearTimeout(keyUpDebounceTimer);
        keyUpDebounceTimer = null;
    }

    if (!pttIsCurrentlyDown) {
        pttIsCurrentlyDown = true;
        sendToAllWindows('ptt:activated');
    }
}

function onKeyUp(e: UiohookKeyboardEvent): void {
    if (!pttEnabled || !pttConfig) return;

    if (e.keycode !== pttConfig.keycode) return;

    if (pttIsCurrentlyDown) {
        if (keyUpDebounceTimer) clearTimeout(keyUpDebounceTimer);
        keyUpDebounceTimer = setTimeout(() => {
            keyUpDebounceTimer = null;
            if (pttIsCurrentlyDown) {
                pttIsCurrentlyDown = false;
                sendToAllWindows('ptt:deactivated');
            }
        }, 30);
    }
}

function ensureHookStarted(): void {
    if (hookStarted) return;
    try {
        uIOhook.on('keydown', onKeyDown);
        uIOhook.on('keyup', onKeyUp);
        uIOhook.start();
        hookStarted = true;
        console.log('[PTT] Global keyboard hook started');
    } catch (err) {
        console.error('[PTT] Failed to start global keyboard hook:', err);
    }
}

function stopHook(): void {
    if (!hookStarted) return;
    try {
        uIOhook.stop();
    } catch (err) {
        console.error('[PTT] Error stopping hook:', err);
    }
    hookStarted = false;
    console.log('[PTT] Global keyboard hook stopped');
}

export function initPushToTalk(): void {
    ipcMain.handle(
        'ptt:configure',
        (_event, config: {
            keycode: number | null;
            ctrl: boolean;
            shift: boolean;
            alt: boolean;
            meta: boolean;
            enabled: boolean;
        }) => {
            pttIsCurrentlyDown = false;
            pttEnabled = config.enabled;

            if (config.keycode !== null) {
                pttConfig = {
                    keycode: config.keycode,
                    requireCtrl: config.ctrl,
                    requireShift: config.shift,
                    requireAlt: config.alt,
                    requireMeta: config.meta,
                };
            } else {
                pttConfig = null;
            }

            if (pttEnabled && pttConfig) {
                ensureHookStarted();
            }

            return { success: true };
        },
    );

    ipcMain.handle('ptt:captureNextKey', () => {
        ensureHookStarted();
        return new Promise<{
            keycode: number;
            ctrlKey: boolean;
            shiftKey: boolean;
            altKey: boolean;
            metaKey: boolean;
        }>((resolve) => {
            keyCaptureResolve = resolve;
        });
    });

    ipcMain.handle('ptt:cancelCapture', () => {
        keyCaptureResolve = null;
        return { success: true };
    });
}

export function cleanupPushToTalk(): void {
    if (keyUpDebounceTimer) {
        clearTimeout(keyUpDebounceTimer);
        keyUpDebounceTimer = null;
    }
    pttIsCurrentlyDown = false;
    keyCaptureResolve = null;
    stopHook();
}
