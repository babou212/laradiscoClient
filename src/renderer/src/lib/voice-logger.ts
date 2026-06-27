// Structured, toggleable logging for the voice / PTT / LiveKit subsystem.
//
// Goal: be able to watch the full VoIP state machine in the renderer devtools
// console to verify behaviour. Logging is ON by default; toggle at runtime from
// the console via `__voiceLog.enable()` / `__voiceLog.disable()` (persisted in
// localStorage), or dump the current state with `__voiceLog.dump()`.

export type VoiceLogCategory =
    | 'conn' // room connect / disconnect / reconnect lifecycle
    | 'ptt' // push-to-talk key + handlers
    | 'mic' // local mic publish / mute state
    | 'part' // participants + tracks
    | 'speak' // speaking indicators (VAD + PTT data packets)
    | 'audio' // playback / deafen / per-user volume
    | 'e2ee' // encryption key apply / rotation
    | 'stats'; // temporary WebRTC stats diagnostics (encoder / network / receiver)

const STORAGE_KEY = 'voice:debugLogging';

const CATEGORY_COLOR: Record<VoiceLogCategory, string> = {
    conn: '#4ea1ff',
    ptt: '#ffb454',
    mic: '#42d392',
    part: '#c792ea',
    speak: '#f78c6c',
    audio: '#7fdbca',
    e2ee: '#ff5370',
    stats: '#c3e88d',
};

function readInitial(): boolean {
    try {
        const v = localStorage.getItem(STORAGE_KEY);
        return v === null ? true : v === 'true';
    } catch {
        return true;
    }
}

let enabled = readInitial();

export function setVoiceLogging(on: boolean): void {
    enabled = on;
    try {
        localStorage.setItem(STORAGE_KEY, String(on));
    } catch {
        // ignore (no localStorage)
    }
}

export function isVoiceLogging(): boolean {
    return enabled;
}

function stamp(): string {
    return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

/** Verbose flow/state log — suppressed when logging is disabled. */
export function vlog(category: VoiceLogCategory, event: string, data?: unknown): void {
    if (!enabled) return;
    const line = `%c${stamp()} %c${category}%c ${event}`;
    const dim = 'color:#888';
    const tag = `color:${CATEGORY_COLOR[category]};font-weight:bold`;
    const reset = 'color:inherit;font-weight:normal';
    if (data !== undefined) {
        console.log(line, dim, tag, reset, data);
    } else {
        console.log(line, dim, tag, reset);
    }
}

/** Warning — always logged regardless of the toggle. */
export function vwarn(category: VoiceLogCategory, event: string, data?: unknown): void {
    const tag = `color:${CATEGORY_COLOR[category]};font-weight:bold`;
    if (data !== undefined) {
        console.warn(`%c${category}%c ${event}`, tag, 'color:inherit', data);
    } else {
        console.warn(`%c${category}%c ${event}`, tag, 'color:inherit');
    }
}

interface VoiceLogWindow {
    __voiceLog?: {
        enable: () => void;
        disable: () => void;
        enabled: () => boolean;
        dump?: () => unknown;
    };
}

/** Register the console toggle helpers (the store adds `dump` once created). */
if (typeof window !== 'undefined') {
    const w = window as unknown as VoiceLogWindow;
    w.__voiceLog = {
        ...w.__voiceLog,
        enable: () => setVoiceLogging(true),
        disable: () => setVoiceLogging(false),
        enabled: isVoiceLogging,
    };
}

/** Attach the live-state dumper exposed as `__voiceLog.dump()`. */
export function registerVoiceStateDump(dump: () => unknown): void {
    if (typeof window === 'undefined') return;
    const w = window as unknown as VoiceLogWindow;
    if (w.__voiceLog) w.__voiceLog.dump = dump;
}
