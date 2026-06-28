import { BrowserWindow, ipcMain } from 'electron';
import { uIOhook, UiohookKey } from 'uiohook-napi';
import type { UiohookKeyboardEvent, UiohookMouseEvent } from 'uiohook-napi';
import type { PttBinding, PttCapture } from '../preload/types/ptt';
import { EvdevSource } from './input/evdev';
import type { Modifiers } from './input/evdev';
import { hasInputAccess, installInputAccess, isAccessRuleInstalled } from './input/evdevAccess';

let pttBinding: PttBinding | null = null;
let pttEnabled = false;
let pttIsCurrentlyDown = false;

let keyUpDebounceTimer: ReturnType<typeof setTimeout> | null = null;

let keyCaptureResolve: ((result: PttCapture) => void) | null = null;

let captureArmedAtMs = 0;

function sendToAllWindows(channel: string, ...args: unknown[]): void {
    BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.isDestroyed()) {
            w.webContents.send(channel, ...args);
        }
    });
}

function activate(reason: Record<string, unknown>): void {
    if (keyUpDebounceTimer) {
        clearTimeout(keyUpDebounceTimer);
        keyUpDebounceTimer = null;
    }
    if (!pttIsCurrentlyDown) {
        pttIsCurrentlyDown = true;
        console.log('[PTT] down → ptt:activated', reason);
        sendToAllWindows('ptt:activated');
    }
}

function scheduleDeactivate(reason: Record<string, unknown>): void {
    if (!pttIsCurrentlyDown) return;
    if (keyUpDebounceTimer) clearTimeout(keyUpDebounceTimer);

    keyUpDebounceTimer = setTimeout(() => {
        keyUpDebounceTimer = null;
        if (pttIsCurrentlyDown) {
            pttIsCurrentlyDown = false;
            console.log('[PTT] up → ptt:deactivated', reason);
            sendToAllWindows('ptt:deactivated');
        }
    }, 30);
}

function handleRawKeyDown(code: number, mods: Modifiers, isModifier: boolean, eventEpochMs: number): void {
    if (keyCaptureResolve) {
        if (isModifier) return; 
        if (eventEpochMs < captureArmedAtMs) return; 
        const resolve = keyCaptureResolve;
        keyCaptureResolve = null;
        resolve({
            device: 'keyboard',
            keycode: code,
            ctrlKey: mods.ctrl,
            shiftKey: mods.shift,
            altKey: mods.alt,
            metaKey: mods.meta,
        });
        return;
    }

    if (!pttEnabled || !pttBinding || pttBinding.device !== 'keyboard') return;
    if (code !== pttBinding.keycode) return;
    if (pttBinding.modifiers.ctrl && !mods.ctrl) return;
    if (pttBinding.modifiers.shift && !mods.shift) return;
    if (pttBinding.modifiers.alt && !mods.alt) return;
    if (pttBinding.modifiers.meta && !mods.meta) return;
    activate({ keycode: code });
}

function handleRawKeyUp(code: number): void {
    if (keyCaptureResolve) return;
    if (!pttEnabled || !pttBinding || pttBinding.device !== 'keyboard') return;
    if (code !== pttBinding.keycode) return;
    scheduleDeactivate({ keycode: code });
}

function handleRawMouseDown(button: number, eventEpochMs: number): void {
    if (keyCaptureResolve) {
        if (eventEpochMs < captureArmedAtMs) return; // stale buffered event (e.g. the "Set Key" click)
        const resolve = keyCaptureResolve;
        keyCaptureResolve = null;
        resolve({ device: 'mouse', button });
        return;
    }

    if (!pttEnabled || !pttBinding || pttBinding.device !== 'mouse') return;
    if (button !== pttBinding.button) return;
    activate({ button });
}

function handleRawMouseUp(button: number): void {
    if (keyCaptureResolve) return;
    if (!pttEnabled || !pttBinding || pttBinding.device !== 'mouse') return;
    if (button !== pttBinding.button) return;
    scheduleDeactivate({ button });
}

interface InputSource {
    start(): boolean;
    stop(): void;
}

const UIOHOOK_MODIFIER_KEYCODES = new Set<number>([
    UiohookKey.Ctrl,
    UiohookKey.CtrlRight,
    UiohookKey.Shift,
    UiohookKey.ShiftRight,
    UiohookKey.Alt,
    UiohookKey.AltRight,
    UiohookKey.Meta,
    UiohookKey.MetaRight,
]);

function createUiohookSource(): InputSource {
    const onKeyDown = (e: UiohookKeyboardEvent): void =>
        handleRawKeyDown(
            e.keycode,
            { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey },
            UIOHOOK_MODIFIER_KEYCODES.has(e.keycode),
            Date.now(),
        );
    const onKeyUp = (e: UiohookKeyboardEvent): void => handleRawKeyUp(e.keycode);
    const onMouseDown = (e: UiohookMouseEvent): void => handleRawMouseDown(e.button as number, Date.now());
    const onMouseUp = (e: UiohookMouseEvent): void => handleRawMouseUp(e.button as number);

    return {
        start() {
            try {
                uIOhook.on('keydown', onKeyDown);
                uIOhook.on('keyup', onKeyUp);
                uIOhook.on('mousedown', onMouseDown);
                uIOhook.on('mouseup', onMouseUp);
                uIOhook.start();
                console.log('[PTT] uiohook input source started');
                return true;
            } catch (err) {
                console.error('[PTT] uiohook failed to start:', err);
                return false;
            }
        },
        stop() {
            try {
                uIOhook.stop();
            } catch (err) {
                console.error('[PTT] uiohook stop error:', err);
            }
            uIOhook.removeListener('keydown', onKeyDown);
            uIOhook.removeListener('keyup', onKeyUp);
            uIOhook.removeListener('mousedown', onMouseDown);
            uIOhook.removeListener('mouseup', onMouseUp);
        },
    };
}

function createEvdevSource(): InputSource {
    const evdev = new EvdevSource({
        onKeyDown: handleRawKeyDown,
        onKeyUp: handleRawKeyUp,
        onMouseDown: handleRawMouseDown,
        onMouseUp: handleRawMouseUp,
    });
    return { start: () => evdev.start(), stop: () => evdev.stop() };
}

let source: InputSource | null = null;

function ensureHookStarted(): void {
    if (source) return;

    if (process.platform === 'linux') {
        const evdev = createEvdevSource();
        if (evdev.start()) {
            source = evdev;
            console.log('[PTT] using evdev input source');
            return;
        }
        console.warn(
            '[PTT] evdev unavailable — falling back to uiohook (keyboard only on X11; no mouse buttons under Wayland). ' +
                'Add the user to the "input" group for global mouse-button push-to-talk.',
        );
    }

    const uiohookSource = createUiohookSource();
    if (uiohookSource.start()) source = uiohookSource;
}

function stopHook(): void {
    if (!source) return;
    source.stop();
    source = null;
}

export function initPushToTalk(): void {
    ipcMain.handle('ptt:configure', (_event, config: { enabled: boolean; binding: PttBinding | null }) => {
        if (keyUpDebounceTimer) {
            clearTimeout(keyUpDebounceTimer);
            keyUpDebounceTimer = null;
        }
        if (pttIsCurrentlyDown) {
            sendToAllWindows('ptt:deactivated');
        }
        pttIsCurrentlyDown = false;
        pttEnabled = config.enabled;
        pttBinding = config.binding;

        console.log('[PTT] configure', { enabled: pttEnabled, binding: pttBinding });

        if (pttEnabled && pttBinding) {
            ensureHookStarted();
        } else if (!keyCaptureResolve) {
            stopHook();
        }

        return { success: true };
    });

    ipcMain.handle('ptt:captureNextKey', () => {
        captureArmedAtMs = Date.now();
        ensureHookStarted();
        return new Promise<PttCapture>((resolve) => {
            keyCaptureResolve = resolve;
        });
    });

    ipcMain.handle('ptt:linuxInputStatus', () => {
        if (process.platform !== 'linux') {
            return { supported: false, hasAccess: true, ruleInstalled: false };
        }
        return { supported: true, hasAccess: hasInputAccess(), ruleInstalled: isAccessRuleInstalled() };
    });

    ipcMain.handle('ptt:setupLinuxInputAccess', async () => {
        if (process.platform !== 'linux') return { status: 'error' as const, hasAccess: true };

        const result = await installInputAccess();

        let hasAccess = hasInputAccess();
        for (let i = 0; i < 10 && !hasAccess; i++) {
            await new Promise((r) => setTimeout(r, 100));
            hasAccess = hasInputAccess();
        }

        if (result.status === 'installed' && hasAccess && pttEnabled && pttBinding) {
            stopHook();
            ensureHookStarted();
        }

        return { ...result, hasAccess };
    });

    ipcMain.handle('ptt:cancelCapture', () => {
        if (keyCaptureResolve) {
            const resolve = keyCaptureResolve;
            keyCaptureResolve = null;
            resolve({
                device: 'keyboard',
                keycode: -1,
                ctrlKey: false,
                shiftKey: false,
                altKey: false,
                metaKey: false,
            });
        }
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
