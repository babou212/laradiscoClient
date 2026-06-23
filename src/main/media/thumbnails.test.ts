import { describe, expect, it, vi } from 'vitest';

// `generateThumbnail` is sharp-driven; stub sharp so the format-selection branch
// logic can be asserted without the native binary.
const { sharp, sharpInstance } = vi.hoisted(() => {
    const sharpInstance = {
        metadata: vi.fn(),
        resize: vi.fn().mockReturnThis(),
        png: vi.fn().mockReturnThis(),
        avif: vi.fn().mockReturnThis(),
        webp: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(Buffer.from('thumb')),
    };
    return { sharp: vi.fn(() => sharpInstance), sharpInstance };
});
vi.mock('sharp', () => ({ default: sharp }));

import { generateThumbnail, isImageMimeType } from './thumbnails';

describe('isImageMimeType', () => {
    it('accepts supported image types', () => {
        for (const m of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']) {
            expect(isImageMimeType(m)).toBe(true);
        }
    });

    it('rejects unsupported types', () => {
        expect(isImageMimeType('image/bmp')).toBe(false);
        expect(isImageMimeType('application/pdf')).toBe(false);
        expect(isImageMimeType('video/mp4')).toBe(false);
    });
});

describe('generateThumbnail format selection', () => {
    it('converts gif to png', async () => {
        sharpInstance.metadata.mockResolvedValue({ format: 'gif', width: 100, height: 100 });
        const result = await generateThumbnail(Buffer.from('gif'));
        expect(sharpInstance.png).toHaveBeenCalled();
        expect(result.format).toBe('image/png');
    });

    it('keeps avif as avif', async () => {
        sharpInstance.metadata.mockResolvedValue({ format: 'avif', width: 100, height: 100 });
        const result = await generateThumbnail(Buffer.from('avif'));
        expect(sharpInstance.avif).toHaveBeenCalled();
        expect(result.format).toBe('image/avif');
    });

    it('converts other formats to webp', async () => {
        sharpInstance.metadata.mockResolvedValue({ format: 'jpeg', width: 100, height: 100 });
        const result = await generateThumbnail(Buffer.from('jpg'));
        expect(sharpInstance.webp).toHaveBeenCalled();
        expect(result.format).toBe('image/webp');
    });
});
