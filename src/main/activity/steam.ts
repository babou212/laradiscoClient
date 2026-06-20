import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { DetectedActivity } from './detect';
import { steamCapsuleUrl } from './detectable';

const execFileAsync = promisify(execFile);

/**
 * Detect the currently-running Steam game by asking Steam itself, rather than
 * matching a hardcoded list of executable names. This picks up ANY installed
 * game and yields its official capsule art for free.
 *
 * Primary signal: Steam launches every game through a `reaper` shim whose
 * command line carries the app id — `reaper SteamLaunch AppId=<appid> -- …`.
 * Scanning the process table for that marker reflects what is running RIGHT
 * NOW, which is what we need. (We deliberately do NOT rely on `registry.vdf`'s
 * `RunningAppID` as the primary source: Steam keeps its registry in memory
 * while running and only flushes that file on shutdown, so the on-disk copy is
 * stale — often missing `RunningAppID` entirely — exactly while a game is
 * being played.)
 *
 * Fallback: the on-disk `registry.vdf` `RunningAppID`, which is still useful on
 * macOS (native launches don't always go through the reaper shim) and after
 * Steam has exited.
 *
 * The game's display name is read from its local `appmanifest_<appid>.acf`
 * (no network), searching every library folder declared in
 * `libraryfolders.vdf` since games are often spread across multiple drives.
 *
 * Windows: the reaper shim isn't used and there is no on-disk `registry.vdf`
 * with a live `RunningAppID` — instead Steam keeps `RunningAppID` current in the
 * real registry under `HKCU\Software\Valve\Steam`. We read it with `reg query`
 * (no native module) and resolve the install root the same way, so any installed
 * game is detected with its capsule art, matching the Linux/macOS behaviour.
 */

/** Steam install roots that may contain `registry.vdf`. */
function steamConfigRoots(): string[] {
    const home = homedir();
    if (process.platform === 'darwin') {
        return [join(home, 'Library', 'Application Support', 'Steam')];
    }
    return [
        join(home, '.steam'),
        join(home, '.steam', 'steam'),
        join(home, '.local', 'share', 'Steam'),
        join(home, '.var', 'app', 'com.valvesoftware.Steam', '.steam', 'steam'),
        join(home, '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam'),
    ];
}

async function steamInstallRoots(): Promise<string[]> {
    const home = homedir();
    if (process.platform === 'win32') {
        const roots = ['C:\\Program Files (x86)\\Steam'];
        const fromReg = await steamRootFromRegistry();
        if (fromReg) roots.unshift(fromReg);
        return roots;
    }
    if (process.platform === 'darwin') {
        return [join(home, 'Library', 'Application Support', 'Steam')];
    }
    return [
        join(home, '.local', 'share', 'Steam'),
        join(home, '.steam', 'steam'),
        join(home, '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam'),
    ];
}

/**
 * Read a single value from the Windows registry via `reg query`. We shell out
 * rather than depend on a native registry module to keep the dependency surface
 * flat. Returns the raw value data (REG_SZ text or REG_DWORD `0x…`), or null.
 */
async function regQuery(key: string, value: string): Promise<string | null> {
    try {
        const { stdout } = await execFileAsync('reg', ['query', key, '/v', value], {
            windowsHide: true,
        });
        // e.g. "    RunningAppID    REG_DWORD    0x1b2e80"
        const m = stdout.match(new RegExp(`${value}\\s+REG_\\w+\\s+(.+)`, 'i'));
        return m ? m[1].trim() : null;
    } catch {
        // `reg` failed or the key/value is absent.
        return null;
    }
}

/**
 * The app id of the game running in the current Steam session, read live from
 * the Windows registry. Steam updates `HKCU\Software\Valve\Steam\RunningAppID`
 * in real time (and clears it to 0 when no game is running), so this is the
 * Windows equivalent of the reaper-process scan used on Linux/macOS.
 */
async function readRunningAppIdFromRegistry(): Promise<number | null> {
    const raw = await regQuery('HKCU\\Software\\Valve\\Steam', 'RunningAppID');
    if (!raw) return null;

    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
}

/** The Steam install root from the registry, with native path separators. */
async function steamRootFromRegistry(): Promise<string | null> {
    const raw =
        (await regQuery('HKCU\\Software\\Valve\\Steam', 'SteamPath')) ??
        (await regQuery('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'));
    // SteamPath uses forward slashes (e.g. c:/program files (x86)/steam).
    return raw ? raw.replace(/\//g, '\\') : null;
}

/**
 * The app id of a game launched in the current session, read live from the
 * process table. Steam spawns games via `…/reaper SteamLaunch AppId=<appid> --`
 * (Proton/native alike), so this is an accurate, real-time signal. Returns the
 * highest-pid match implicitly via the last regex hit; in practice only one
 * game runs at a time.
 */
async function readRunningAppIdFromProcesses(): Promise<number | null> {
    try {
        const { stdout } = await execFileAsync('ps', ['-axo', 'args'], {
            maxBuffer: 8 * 1024 * 1024,
        });
        const m = stdout.match(/SteamLaunch\s+AppId=(\d+)/i);
        if (m) {
            const id = Number(m[1]);
            return Number.isFinite(id) && id > 0 ? id : null;
        }
    } catch {
        // `ps` unavailable or failed — fall through to the registry.vdf read.
    }
    return null;
}

async function readRunningAppId(): Promise<number | null> {
    for (const root of steamConfigRoots()) {
        try {
            const vdf = await readFile(join(root, 'registry.vdf'), 'utf8');
            const m = vdf.match(/"RunningAppID"\s+"(\d+)"/i);
            if (m) {
                const id = Number(m[1]);
                return Number.isFinite(id) ? id : null;
            }
        } catch {
            // File absent at this root — try the next candidate.
        }
    }
    return null;
}

/** All Steam library roots, including extra drives from `libraryfolders.vdf`. */
async function steamLibraryPaths(): Promise<string[]> {
    const roots = await steamInstallRoots();
    const paths = new Set<string>(roots);

    for (const base of roots) {
        for (const candidate of [
            join(base, 'steamapps', 'libraryfolders.vdf'),
            join(base, 'config', 'libraryfolders.vdf'),
        ]) {
            try {
                const vdf = await readFile(candidate, 'utf8');
                for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/gi)) {
                    // VDF escapes backslashes; normalise for Windows-style paths.
                    paths.add(m[1].replace(/\\\\/g, '\\'));
                }
            } catch {
                // No library index here — fine.
            }
        }
    }

    return [...paths];
}

async function resolveGameName(appId: number): Promise<string | null> {
    for (const lib of await steamLibraryPaths()) {
        try {
            const acf = await readFile(join(lib, 'steamapps', `appmanifest_${appId}.acf`), 'utf8');
            const m = acf.match(/"name"\s+"([^"]+)"/i);
            if (m) return m[1];
        } catch {
            // Game not installed in this library — keep looking.
        }
    }
    return null;
}

export async function detectSteamGame(): Promise<DetectedActivity | null> {
    const appId =
        process.platform === 'win32'
            ? // Windows keeps a live RunningAppID in the real registry.
              await readRunningAppIdFromRegistry()
            : // Elsewhere: live process signal first, stale registry.vdf as fallback.
              ((await readRunningAppIdFromProcesses()) ?? (await readRunningAppId()));
    if (!appId || appId <= 0) return null;

    const name = (await resolveGameName(appId)) ?? `Steam game ${appId}`;
    return {
        type: 'game',
        name,
        application_id: `steam-${appId}`,
        details: null,
        icon: steamCapsuleUrl(appId),
    };
}
