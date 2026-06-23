import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoundResource } from './types';

const get = vi.fn();
const post = vi.fn();
const del = vi.fn();

vi.mock('./client', () => ({
    default: {
        get: (...args: unknown[]) => get(...args),
        post: (...args: unknown[]) => post(...args),
        delete: (...args: unknown[]) => del(...args),
    },
}));

import { deleteSound, listSounds, normalizeSound, playSound, uploadSound } from './soundboard';

function soundResource(overrides: Partial<SoundResource['attributes']> = {}, id = '1'): SoundResource {
    return {
        id,
        type: 'sounds',
        attributes: {
            name: 'Airhorn',
            duration_ms: 4200,
            url: 'https://cdn.test/airhorn.ogg',
            mime_type: 'audio/ogg',
            uploaded_by_id: 7,
            created_at: '2026-06-23T00:00:00Z',
            ...overrides,
        },
    };
}

beforeEach(() => {
    get.mockReset();
    post.mockReset();
    del.mockReset();
});

describe('normalizeSound', () => {
    it('flattens a JSON:API resource and stringifies the uploader id', () => {
        const sound = normalizeSound(soundResource());
        expect(sound).toEqual({
            id: '1',
            name: 'Airhorn',
            durationMs: 4200,
            url: 'https://cdn.test/airhorn.ogg',
            mimeType: 'audio/ogg',
            uploadedById: '7',
        });
    });

    it('maps absent url/mime/uploader to null', () => {
        const sound = normalizeSound(soundResource({ url: null, mime_type: null, uploaded_by_id: null }));
        expect(sound.url).toBeNull();
        expect(sound.mimeType).toBeNull();
        expect(sound.uploadedById).toBeNull();
    });
});

describe('listSounds', () => {
    it('requests the library and normalizes each resource', async () => {
        get.mockResolvedValue({ data: { data: [soundResource({}, '1'), soundResource({ name: 'Boo' }, '2')] } });

        const sounds = await listSounds();

        expect(get).toHaveBeenCalledWith('/soundboard/sounds');
        expect(sounds.map((s) => s.id)).toEqual(['1', '2']);
        expect(sounds[1].name).toBe('Boo');
    });

    it('returns an empty array when the payload has no data', async () => {
        get.mockResolvedValue({ data: {} });
        expect(await listSounds()).toEqual([]);
    });
});

describe('uploadSound', () => {
    it('posts multipart form data with the name and file, returning the new sound', async () => {
        post.mockResolvedValue({ data: { data: soundResource({ name: 'Yeah' }, '9') } });

        const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/ogg' });
        const sound = await uploadSound('Yeah', blob, 'clip.ogg');

        expect(post).toHaveBeenCalledTimes(1);
        const [url, body, config] = post.mock.calls[0];
        expect(url).toBe('/soundboard/sounds');
        expect(body).toBeInstanceOf(FormData);
        expect((body as FormData).get('name')).toBe('Yeah');
        expect((body as FormData).get('file')).toBeInstanceOf(Blob);
        expect((config as { headers: Record<string, string> }).headers['Content-Type']).toBe('multipart/form-data');
        expect(sound).toMatchObject({ id: '9', name: 'Yeah' });
    });

    it('reports upload progress through the callback', async () => {
        post.mockImplementation((_url: string, _body: unknown, config: { onUploadProgress?: (e: unknown) => void }) => {
            config.onUploadProgress?.({ loaded: 50, total: 100 });
            return Promise.resolve({ data: { data: soundResource() } });
        });
        const onProgress = vi.fn();

        await uploadSound('Airhorn', new Blob(['x']), 'clip.ogg', onProgress);

        expect(onProgress).toHaveBeenCalledWith(50);
    });
});

describe('deleteSound', () => {
    it('deletes by id', async () => {
        del.mockResolvedValue(undefined);
        await deleteSound('42');
        expect(del).toHaveBeenCalledWith('/soundboard/sounds/42');
    });
});

describe('playSound', () => {
    it('posts to the channel play route with a numeric sound id', async () => {
        post.mockResolvedValue(undefined);
        await playSound('5', '7');
        expect(post).toHaveBeenCalledWith('/channels/5/voice/soundboard/play', { sound_id: 7 });
    });
});
