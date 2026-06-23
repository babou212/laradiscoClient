import { sep } from 'path';
import { describe, expect, it, vi } from 'vitest';

const { existsSync } = vi.hoisted(() => ({ existsSync: vi.fn() }));
vi.mock('fs', () => ({ existsSync }));
// The module reads these at import; give them deterministic values.
vi.mock('ffmpeg-static', () => ({ default: `/app/app.asar${sep}node_modules/ffmpeg-static/ffmpeg` }));
vi.mock('ffprobe-static', () => ({ default: { path: `/app/app.asar${sep}node_modules/ffprobe-static/ffprobe` } }));

import { resolveBinary, unpacked } from './ffmpeg';

describe('unpacked', () => {
    it('rewrites app.asar to app.asar.unpacked', () => {
        expect(unpacked(`/x/app.asar${sep}bin/ffmpeg`)).toBe(`/x/app.asar.unpacked${sep}bin/ffmpeg`);
    });

    it('passes through paths without app.asar', () => {
        expect(unpacked(`/usr/bin/ffmpeg`)).toBe('/usr/bin/ffmpeg');
    });

    it('returns null for null input', () => {
        expect(unpacked(null)).toBeNull();
    });
});

describe('resolveBinary', () => {
    it('returns the static path when it exists on disk', () => {
        existsSync.mockReturnValue(true);
        expect(resolveBinary('/opt/ffmpeg', 'ffmpeg')).toBe('/opt/ffmpeg');
    });

    it('falls back to the command name when the static path is missing', () => {
        existsSync.mockReturnValue(false);
        expect(resolveBinary('/opt/ffmpeg', 'ffmpeg')).toBe('ffmpeg');
    });

    it('falls back when the static path is null', () => {
        expect(resolveBinary(null, 'ffprobe')).toBe('ffprobe');
    });
});
