import { describe, expect, it } from 'vitest';
import type { Attachment, LinkPreviewData } from '@/types/chat';
import {
    isGifUrl,
    stripPreviewUrl,
    stripYoutubeUrl,
    visibleAttachments,
    youtubeEmbedUrl,
    youtubeVideoId,
    youtubeWatchUrl,
} from './messageMedia';

describe('youtubeVideoId', () => {
    it('extracts the id from a watch url', () => {
        expect(youtubeVideoId('look https://www.youtube.com/watch?v=dQw4w9WgXcQ now')).toBe('dQw4w9WgXcQ');
    });
    it('extracts the id from a youtu.be url', () => {
        expect(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });
    it('returns null when there is no youtube url', () => {
        expect(youtubeVideoId('just some text')).toBeNull();
    });
});

describe('youtube url builders', () => {
    it('builds watch and nocookie embed urls', () => {
        expect(youtubeWatchUrl('abc12345678')).toBe('https://www.youtube.com/watch?v=abc12345678');
        expect(youtubeEmbedUrl('abc12345678')).toContain('youtube-nocookie.com/embed/abc12345678');
    });
});

describe('stripYoutubeUrl', () => {
    it('removes the youtube url from the content', () => {
        expect(stripYoutubeUrl('watch https://youtu.be/dQw4w9WgXcQ')).toBe('watch');
    });
});

describe('isGifUrl', () => {
    it('detects .gif and tenor urls', () => {
        expect(isGifUrl('https://example.com/cat.gif')).toBe(true);
        expect(isGifUrl('https://tenor.com/view/x')).toBe(true);
        expect(isGifUrl('plain text')).toBe(false);
    });
});

describe('stripPreviewUrl', () => {
    const preview = { url: 'https://ex.com/a', title: 't', fetched_at: 0 } as LinkPreviewData;
    it('removes the preview url and collapses whitespace', () => {
        expect(stripPreviewUrl('see https://ex.com/a cool', preview)).toBe('see cool');
    });
    it('returns content unchanged with no preview', () => {
        expect(stripPreviewUrl('hi', null)).toBe('hi');
    });
});

describe('visibleAttachments', () => {
    const att = (id: string): Attachment => ({
        id,
        file_name: `${id}.png`,
        mime_type: 'image/png',
        size: 1,
        has_thumbnail: false,
    });
    it('excludes the link-preview image attachment', () => {
        const preview = {
            url: 'u',
            title: 't',
            fetched_at: 0,
            image: { id: 'p1', mime_type: 'image/png', size: 1 },
        } as LinkPreviewData;
        const result = visibleAttachments([att('a1'), att('p1')], preview);
        expect(result.map((a) => a.id)).toEqual(['a1']);
    });
    it('returns all attachments when there is no preview image', () => {
        expect(visibleAttachments([att('a1')], null)).toHaveLength(1);
    });
    it('handles undefined attachments', () => {
        expect(visibleAttachments(undefined, null)).toEqual([]);
    });
});
