import { beforeEach, describe, expect, it, vi } from 'vitest';

const detectSteamGame = vi.fn();
vi.mock('./steam', () => ({ detectSteamGame: () => detectSteamGame() }));

// promisify(execFile) calls execFile(file, args, opts, cb) — resolve with {stdout}.
let processList: string[] = [];
vi.mock('node:child_process', () => ({
    execFile: (_file: string, _args: string[], _opts: unknown, cb: (e: unknown, r: unknown) => void) => {
        cb(null, { stdout: ['COMM', ...processList].join('\n'), stderr: '' });
    },
}));

import { detectOnce, normalizeExe } from './detect';

beforeEach(() => {
    detectSteamGame.mockReset().mockResolvedValue(null);
    processList = [];
});

describe('normalizeExe', () => {
    it('lowercases, trims and drops a .exe suffix', () => {
        expect(normalizeExe('  Code.EXE ')).toBe('code');
        expect(normalizeExe('cs2')).toBe('cs2');
    });
});

describe('detectOnce', () => {
    it('returns the running Steam game when one is detected (wins over exe match)', async () => {
        const game = { type: 'game', name: 'Half-Life', application_id: 'steam-70', details: null, icon: null };
        detectSteamGame.mockResolvedValue(game);
        processList = ['code'];
        expect(await detectOnce()).toBe(game);
    });

    it('matches a detectable executable from the process list', async () => {
        processList = ['cs2', 'bash', 'firefox'];
        const result = await detectOnce();
        expect(result?.name).toBe('Counter-Strike 2');
        expect(result?.type).toBe('game');
    });

    it('returns null when nothing matches', async () => {
        processList = ['bash', 'firefox', 'someunknownproc'];
        expect(await detectOnce()).toBeNull();
    });
});
