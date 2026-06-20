import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { BrowserWindow, ipcMain } from 'electron';
import { DETECTABLE, resolveIcon, type ActivityType } from './detectable';
import { detectSteamGame } from './steam';

const execFileAsync = promisify(execFile);

/**
 * The activity payload emitted to the renderer. `started_at` is deliberately
 * absent — the backend stamps it server-side so the elapsed timer is monotonic
 * and trusted, regardless of any client clock skew.
 */
export interface DetectedActivity {
    type: ActivityType;
    name: string;
    application_id: string;
    details: string | null;
    icon: string | null;
}

const POLL_INTERVAL_MS = 15_000;
const INITIAL_DELAY_MS = 5_000;

// Detection starts disabled: the renderer enables it after login once the
// authenticated user's `show_activity` privacy preference is known, so we never
// scan processes before a user has opted in.
let enabled = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let current: DetectedActivity | null = null;

function sendToAllWindows(channel: string, ...args: unknown[]): void {
    BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.isDestroyed() && !w.webContents.isDestroyed()) {
            w.webContents.send(channel, ...args);
        }
    });
}

/** Normalise an executable/process name for comparison: lower-case, drop `.exe`. */
function normalizeExe(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .replace(/\.exe$/, '');
}

/**
 * Enumerate the names of currently running processes. Zero-dependency: shells
 * out to the platform's standard process lister. (A library such as `ps-list`
 * could replace this later; it would need `asarUnpack` for its bundled Windows
 * helper, mirroring the ffmpeg binaries.)
 */
async function listProcessNames(): Promise<string[]> {
    if (process.platform === 'win32') {
        const { stdout } = await execFileAsync('tasklist', ['/fo', 'csv', '/nh'], {
            windowsHide: true,
            maxBuffer: 4 * 1024 * 1024,
        });
        return stdout
            .split(/\r?\n/)
            .map((line) => line.match(/^"([^"]+)"/)?.[1] ?? '')
            .filter(Boolean);
    }

    // macOS & Linux: `comm` is the executable basename (Linux truncates it to
    // 15 chars, which the truncation fallback below accounts for).
    const { stdout } = await execFileAsync('ps', ['-axo', 'comm'], {
        maxBuffer: 4 * 1024 * 1024,
    });
    return stdout
        .split('\n')
        .slice(1) // drop the "COMM" header
        .map((line) => line.trim())
        .filter(Boolean)
        .map((path) => path.split('/').pop() ?? path); // basename for macOS full paths
}

/** Find the first detectable entry whose executable is currently running. */
async function detectOnce(): Promise<DetectedActivity | null> {
    // A running Steam game is the most salient status and is detected directly
    // from Steam's own state, so it wins over executable-name matching.
    const steamGame = await detectSteamGame();
    if (steamGame) return steamGame;

    const names = await listProcessNames();
    const running = new Set(names.map(normalizeExe));

    for (const entry of DETECTABLE) {
        const match = entry.executables.some((exe) => {
            const target = normalizeExe(exe);
            if (running.has(target)) return true;
            // Linux truncates process names to 15 chars; accept a running name
            // that is a prefix of a longer executable when it looks truncated.
            return process.platform === 'linux' && target.length > 15 && running.has(target.slice(0, 15));
        });

        if (match) {
            return {
                type: entry.type,
                name: entry.name,
                application_id: entry.application_id,
                details: null,
                icon: resolveIcon(entry),
            };
        }
    }

    return null;
}

function sameActivity(a: DetectedActivity | null, b: DetectedActivity | null): boolean {
    if (a === null || b === null) return a === b;
    return a.application_id === b.application_id;
}

function setCurrent(next: DetectedActivity | null): void {
    if (sameActivity(current, next)) return;
    current = next;
    sendToAllWindows('activity:changed', current);
}

async function poll(): Promise<void> {
    if (!enabled) return;
    try {
        setCurrent(await detectOnce());
    } catch (err) {
        // Keep the last known activity on a transient failure rather than flapping.
        console.error('[Activity] process scan failed:', err);
    }
}

function startPolling(): void {
    if (pollTimer || pollInterval) return;
    pollTimer = setTimeout(() => {
        pollTimer = null;
        void poll();
        pollInterval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    }, INITIAL_DELAY_MS);
}

function stopPolling(): void {
    if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
    }
    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }
}

export function initActivityDetection(): void {
    ipcMain.handle('activity:setEnabled', (_event, value: boolean) => {
        const next = Boolean(value);
        if (next === enabled) return { success: true };
        enabled = next;

        if (enabled) {
            startPolling();
        } else {
            stopPolling();
            setCurrent(null); // clear immediately when sharing is turned off
        }
        return { success: true };
    });

    ipcMain.handle('activity:getCurrent', () => current);
}

export function cleanupActivityDetection(): void {
    stopPolling();
    enabled = false;
    current = null;
}
