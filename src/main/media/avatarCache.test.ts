import { mkdtempSync, writeFileSync } from 'fs';
import { mkdir, readdir, utimes, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { app } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

import {
    ensureAvatarCached,
    keyForUrl,
    pruneAvatarCache,
    readAvatarFile,
    sniffMime,
    versionToken,
} from './avatarCache';

let dir: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'avatar-cache-test-'));
    vi.mocked(app.getPath).mockReturnValue(dir);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('versionToken', () => {
    it('uses the media id after `avatar`, not the earlier user id', () => {
        expect(versionToken('/api/v1/users/7/avatar/12/thumb')).toBe('12');
    });

    it('uses the first numeric path segment as the version', () => {
        expect(versionToken('/media/42/conversions/avatar.png')).toBe('42');
    });

    it('hashes the directory when there is no numeric segment', () => {
        const token = versionToken('/avatars/abc/def.png');
        expect(token.startsWith('x')).toBe(true);
        expect(token.length).toBeGreaterThan(1);
    });
});

describe('keyForUrl', () => {
    it('builds a userId__version__sha256 key', () => {
        const result = keyForUrl('7', 'https://cdn.example.com/media/99/avatar.png');
        expect(result).not.toBeNull();
        expect(result!.version).toBe('99');
        expect(result!.key).toMatch(/^7__99__[a-f0-9]{64}$/);
    });

    it('returns null for a non-numeric userId', () => {
        expect(keyForUrl('abc', 'https://cdn.example.com/1/a.png')).toBeNull();
    });

    it('returns null for an invalid URL', () => {
        expect(keyForUrl('7', 'not a url')).toBeNull();
    });
});

describe('sniffMime', () => {
    it('detects jpeg/png/gif/webp magic bytes', () => {
        expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe('image/jpeg');
        expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe('image/png');
        expect(sniffMime(Buffer.from('GIF89a'))).toBe('image/gif');
        const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);
        expect(sniffMime(webp)).toBe('image/webp');
    });

    it('returns octet-stream for unknown data', () => {
        expect(sniffMime(Buffer.from([0, 1, 2, 3]))).toBe('application/octet-stream');
    });
});

describe('readAvatarFile', () => {
    it('returns null for a malformed key', async () => {
        expect(await readAvatarFile('not-a-valid-key')).toBeNull();
    });

    it('reads a cached file and sniffs its mime', async () => {
        const key = `5__1__${'a'.repeat(64)}`;
        await mkdir(join(dir, 'avatar-cache'), { recursive: true });
        writeFileSync(join(dir, 'avatar-cache', key), Buffer.from([0xff, 0xd8, 0xff, 0x00]));
        const result = await readAvatarFile(key);
        expect(result?.mime).toBe('image/jpeg');
    });
});

describe('ensureAvatarCached', () => {
    it('downloads via net.fetch and writes the cache file', async () => {
        const { net } = await import('electron');
        vi.mocked(net.fetch).mockResolvedValue({
            ok: true,
            arrayBuffer: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer,
        } as unknown as Response);

        const key = await ensureAvatarCached('7', 'https://cdn.example.com/media/12/avatar.png');
        expect(key).toMatch(/^7__12__[a-f0-9]{64}$/);
        const files = await readdir(join(dir, 'avatar-cache'));
        expect(files).toContain(key);
    });

    it('returns null for an invalid url/userId without fetching', async () => {
        const { net } = await import('electron');
        expect(await ensureAvatarCached('bad', 'not a url')).toBeNull();
        expect(net.fetch).not.toHaveBeenCalled();
    });
});

describe('pruneAvatarCache', () => {
    it('keeps only the newest MAX_ENTRIES files', async () => {
        const cache = join(dir, 'avatar-cache');
        await mkdir(cache, { recursive: true });
        // Create 1002 valid-key files with increasing mtimes; expect 2 oldest pruned.
        const total = 1002;
        for (let i = 0; i < total; i++) {
            const key = `9__${i}__${'b'.repeat(64)}`;
            await writeFile(join(cache, key), 'x');
            await utimes(join(cache, key), new Date(1000 + i), new Date(1000 + i));
        }
        await pruneAvatarCache();
        const remaining = await readdir(cache);
        expect(remaining.length).toBe(1000);
        // The two oldest (i=0,1) should be gone.
        expect(remaining).not.toContain(`9__0__${'b'.repeat(64)}`);
        expect(remaining).not.toContain(`9__1__${'b'.repeat(64)}`);
    });
});
