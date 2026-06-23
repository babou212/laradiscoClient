import { describe, expect, it } from 'vitest';
import { formatReplyPreview } from './replyPreviewText';

describe('formatReplyPreview', () => {
    it('collapses whitespace and trims', () => {
        expect(formatReplyPreview('hello   \n  world')).toBe('hello world');
    });

    it('returns "See attachment" for empty content', () => {
        expect(formatReplyPreview('')).toBe('See attachment');
        expect(formatReplyPreview('   ')).toBe('See attachment');
    });

    it('replaces a URL with its link-preview title when available', () => {
        const out = formatReplyPreview('look https://example.com/x', {
            url: 'https://example.com/x',
            title: 'Cool Page',
            fetched_at: 1767225600000,
        });
        expect(out).toBe('look Cool Page');
    });

    it('replaces a URL with its hostname (www-stripped) when no preview title', () => {
        expect(formatReplyPreview('see https://www.example.com/path')).toBe('see example.com');
    });

    it('truncates long content with an ellipsis', () => {
        const out = formatReplyPreview('a'.repeat(200));
        expect(out.length).toBeLessThanOrEqual(80);
        expect(out.endsWith('…')).toBe(true);
    });
});
