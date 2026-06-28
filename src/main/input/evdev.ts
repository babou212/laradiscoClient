import { closeSync, constants, openSync, readdirSync, readSync, watch } from 'fs';
import type { FSWatcher } from 'fs';
import { join } from 'path';

const POLL_INTERVAL_MS = 8;

const READ_BUFFER_SIZE = 4096;

export interface Modifiers {
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    meta: boolean;
}

export interface EvdevHandlers {
    onKeyDown(code: number, mods: Modifiers, isModifier: boolean, eventEpochMs: number): void;
    onKeyUp(code: number): void;
    onMouseDown(button: number, eventEpochMs: number): void;
    onMouseUp(button: number): void;
}

const INPUT_DIR = '/dev/input';
const EV_KEY = 0x01;

const IS_64BIT = ['x64', 'arm64', 'ppc64', 's390x', 'loong64', 'riscv64'].includes(process.arch);
const TV_SIZE = IS_64BIT ? 16 : 8;
const EVENT_SIZE = TV_SIZE + 8;

const MODIFIER_CODES: Record<number, keyof Modifiers> = {
    29: 'ctrl',
    97: 'ctrl',
    42: 'shift',
    54: 'shift',
    56: 'alt',
    100: 'alt',
    125: 'meta',
    126: 'meta',
};

const MOUSE_BUTTONS: Record<number, number> = {
    0x110: 1,
    0x111: 2,
    0x112: 3,
    0x113: 4,
    0x114: 5,
    0x115: 6,
    0x116: 7,
    0x117: 8,
};

export class EvdevSource {
    private fds = new Map<string, number>();
    private heldModifiers = new Set<number>();
    private watcher: FSWatcher | null = null;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private readonly readBuf = Buffer.allocUnsafe(READ_BUFFER_SIZE);

    constructor(private readonly handlers: EvdevHandlers) {}

    start(): boolean {
        let files: string[];
        try {
            files = readdirSync(INPUT_DIR).filter((f) => f.startsWith('event'));
        } catch (err) {
            console.error('[PTT][evdev] cannot list', INPUT_DIR, err);
            return false;
        }

        for (const f of files) this.openDevice(join(INPUT_DIR, f));

        if (this.fds.size === 0) {
            console.error('[PTT][evdev] could not open any input device — is the user in the "input" group?');
            return false;
        }

        try {
            this.watcher = watch(INPUT_DIR, (_event, filename) => {
                if (filename && filename.startsWith('event')) {
                    const path = join(INPUT_DIR, filename);
                    if (!this.fds.has(path)) setTimeout(() => this.openDevice(path), 100);
                }
            });
        } catch {
            // hot-plug detection is best-effort
        }

        this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
        console.log(`[PTT][evdev] reading ${this.fds.size} input device(s)`);
        return true;
    }

    stop(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        this.watcher?.close();
        this.watcher = null;
        for (const fd of this.fds.values()) {
            try {
                closeSync(fd);
            } catch {
                // already gone (unplugged); nothing to close
            }
        }
        this.fds.clear();
        this.heldModifiers.clear();
    }

    private openDevice(path: string): void {
        if (this.fds.has(path)) return;
        let fd: number;
        try {
            fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
        } catch {
            return;
        }
        this.fds.set(path, fd);
    }

    private dropDevice(path: string): void {
        const fd = this.fds.get(path);
        if (fd !== undefined) {
            try {
                closeSync(fd);
            } catch {
                // device already removed
            }
        }
        this.fds.delete(path);
    }

    private poll(): void {
        for (const [path, fd] of this.fds) this.drain(path, fd);
    }

    private drain(path: string, fd: number): void {
        for (;;) {
            let bytes: number;
            try {
                bytes = readSync(fd, this.readBuf, 0, READ_BUFFER_SIZE, null);
            } catch (err) {
                const code = (err as NodeJS.ErrnoException).code;
                if (code === 'EAGAIN') return;
                this.dropDevice(path);
                return;
            }
            if (bytes <= 0) return;

            for (let offset = 0; offset + EVENT_SIZE <= bytes; offset += EVENT_SIZE) {
                const tvSec = IS_64BIT ? Number(this.readBuf.readBigInt64LE(offset)) : this.readBuf.readInt32LE(offset);
                const tvUsec = IS_64BIT
                    ? Number(this.readBuf.readBigInt64LE(offset + 8))
                    : this.readBuf.readInt32LE(offset + 4);
                const type = this.readBuf.readUInt16LE(offset + TV_SIZE);
                const code = this.readBuf.readUInt16LE(offset + TV_SIZE + 2);
                const value = this.readBuf.readInt32LE(offset + TV_SIZE + 4);
                if (type === EV_KEY) this.dispatch(code, value, tvSec * 1000 + tvUsec / 1000);
            }
        }
    }

    private dispatch(code: number, value: number, eventEpochMs: number): void {
        const button = MOUSE_BUTTONS[code];
        if (button !== undefined) {
            if (value === 1) this.handlers.onMouseDown(button, eventEpochMs);
            else if (value === 0) this.handlers.onMouseUp(button);
            return;
        }

        const modifier = MODIFIER_CODES[code];
        if (value === 1) {
            if (modifier) this.heldModifiers.add(code);
            this.handlers.onKeyDown(code, this.currentModifiers(), modifier !== undefined, eventEpochMs);
        } else if (value === 0) {
            if (modifier) this.heldModifiers.delete(code);
            this.handlers.onKeyUp(code);
        }
    }

    private currentModifiers(): Modifiers {
        const mods: Modifiers = { ctrl: false, shift: false, alt: false, meta: false };
        for (const code of this.heldModifiers) mods[MODIFIER_CODES[code]] = true;
        return mods;
    }
}
