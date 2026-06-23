import { describe, expect, it } from 'vitest';
import { extractFirstPreviewUrl } from './extractUrls';

describe('extractFirstPreviewUrl', () => {
    it('returns the first https URL suitable for preview', () => {
        expect(extractFirstPreviewUrl('check https://example.com/article out')).toBe('https://example.com/article');
    });

    it('returns null when there is no URL', () => {
        expect(extractFirstPreviewUrl('just some text')).toBeNull();
    });

    it('ignores http (non-https) URLs', () => {
        expect(extractFirstPreviewUrl('http://example.com')).toBeNull();
    });

    it('skips youtube/tenor/giphy hosts', () => {
        expect(extractFirstPreviewUrl('https://youtu.be/abc')).toBeNull();
        expect(extractFirstPreviewUrl('https://www.youtube.com/watch?v=x')).toBeNull();
        expect(extractFirstPreviewUrl('https://media.tenor.com/x.gif')).toBeNull();
        expect(extractFirstPreviewUrl('https://giphy.com/x')).toBeNull();
    });

    it('skips direct image URLs', () => {
        expect(extractFirstPreviewUrl('https://example.com/pic.png')).toBeNull();
        expect(extractFirstPreviewUrl('https://example.com/a.JPEG')).toBeNull();
    });

    it('strips trailing punctuation', () => {
        expect(extractFirstPreviewUrl('see https://example.com/page.')).toBe('https://example.com/page');
        expect(extractFirstPreviewUrl('(https://example.com/x)')).toBe('https://example.com/x');
    });

    it('returns the first non-skipped URL when several are present', () => {
        expect(extractFirstPreviewUrl('https://youtu.be/a then https://example.com/b')).toBe('https://example.com/b');
    });
});
