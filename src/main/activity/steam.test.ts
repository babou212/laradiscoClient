import { beforeEach, describe, expect, it, vi } from 'vitest';

let psOutput = '';
const readFile = vi.fn();

vi.mock('node:child_process', () => ({
    execFile: (_file: string, _args: string[], _opts: unknown, cb: (e: unknown, r: unknown) => void) => {
        cb(null, { stdout: psOutput, stderr: '' });
    },
}));
vi.mock('node:fs/promises', () => ({ readFile: (...a: unknown[]) => readFile(...a) }));

import { detectSteamGame } from './steam';

beforeEach(() => {
    psOutput = '';
    readFile.mockReset().mockRejectedValue(new Error('ENOENT'));
});

describe('detectSteamGame (linux)', () => {
    it('detects the running app id from the reaper marker and resolves its name from the ACF', async () => {
        psOutput = 'reaper SteamLaunch AppId=440 -- /games/tf2/tf_linux64';
        readFile.mockImplementation(async (path: string) => {
            if (path.includes('appmanifest_440.acf')) return '"AppState"{ "name"  "Team Fortress 2" }';
            throw new Error('ENOENT');
        });

        const result = await detectSteamGame();
        expect(result).toMatchObject({
            type: 'game',
            name: 'Team Fortress 2',
            application_id: 'steam-440',
            icon: expect.stringContaining('/440/'),
        });
    });

    it('falls back to a generic name when the ACF is missing', async () => {
        psOutput = 'reaper SteamLaunch AppId=12345 -- /x';
        const result = await detectSteamGame();
        expect(result?.name).toBe('Steam game 12345');
        expect(result?.application_id).toBe('steam-12345');
    });

    it('returns null when no Steam game is running', async () => {
        psOutput = 'bash\nfirefox\nnode';
        expect(await detectSteamGame()).toBeNull();
    });
});
