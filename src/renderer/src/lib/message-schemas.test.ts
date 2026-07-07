import { describe, expect, it } from 'vitest';
import {
    FileAddSchema,
    GifUrlSchema,
    MAX_FILES,
    MAX_MESSAGE_LENGTH,
    MentionValueSchema,
    MessageSendSchema,
} from './message-schemas';

function stagedFile(name = 'a.png'): { file: File; id: string } {
    return { file: new File(['x'], name), id: `id-${name}` };
}

describe('MessageSendSchema', () => {
    it('rejects empty content with no files', () => {
        expect(MessageSendSchema.safeParse({ content: '   ', files: [] }).success).toBe(false);
    });

    it('accepts content only', () => {
        expect(MessageSendSchema.safeParse({ content: 'hello', files: [] }).success).toBe(true);
    });

    it('accepts files only (no content)', () => {
        expect(MessageSendSchema.safeParse({ content: '', files: [stagedFile()] }).success).toBe(true);
    });

    it('rejects content over the max length', () => {
        const content = 'a'.repeat(MAX_MESSAGE_LENGTH + 1);
        expect(MessageSendSchema.safeParse({ content, files: [] }).success).toBe(false);
    });

    it('rejects more than MAX_FILES attachments', () => {
        const files = Array.from({ length: MAX_FILES + 1 }, (_, i) => stagedFile(`f${i}.png`));
        expect(MessageSendSchema.safeParse({ content: 'hi', files }).success).toBe(false);
    });
});

describe('GifUrlSchema', () => {
    it('allows Klipy, Tenor and Giphy hosts (incl. subdomains)', () => {
        expect(GifUrlSchema.safeParse('https://static.klipy.com/ii/abc.gif').success).toBe(true);
        expect(GifUrlSchema.safeParse('https://media.tenor.com/abc.gif').success).toBe(true);
        expect(GifUrlSchema.safeParse('https://giphy.com/x.gif').success).toBe(true);
        expect(GifUrlSchema.safeParse('https://media.giphy.com/x.gif').success).toBe(true);
    });

    it('rejects non-allowed hosts', () => {
        expect(GifUrlSchema.safeParse('https://evil.com/x.gif').success).toBe(false);
    });

    it('rejects non-https URLs', () => {
        expect(GifUrlSchema.safeParse('http://tenor.com/x.gif').success).toBe(false);
    });

    it('rejects a host that merely contains an allowed host as substring', () => {
        expect(GifUrlSchema.safeParse('https://tenor.com.evil.com/x.gif').success).toBe(false);
    });
});

describe('MentionValueSchema', () => {
    it('accepts word characters', () => {
        expect(MentionValueSchema.safeParse('alice_99').success).toBe(true);
    });

    it('rejects punctuation', () => {
        expect(MentionValueSchema.safeParse('al-ice').success).toBe(false);
    });

    it('rejects overly long usernames', () => {
        expect(MentionValueSchema.safeParse('a'.repeat(256)).success).toBe(false);
    });
});

describe('FileAddSchema', () => {
    it('accepts a normal file', () => {
        expect(FileAddSchema.safeParse(new File(['x'], 'a.png')).success).toBe(true);
    });

    it('rejects a file over 100 MB', () => {
        const big = new File([''], 'big.bin');
        Object.defineProperty(big, 'size', { value: 101 * 1024 * 1024 });
        expect(FileAddSchema.safeParse(big).success).toBe(false);
    });
});
