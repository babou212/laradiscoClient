import { beforeEach, describe, expect, it, vi } from 'vitest';

const lookup = vi.fn();
vi.mock('dns/promises', () => ({ lookup: (...args: unknown[]) => lookup(...args) }));

import {
    assertPublicHostname,
    decodeHtmlEntities,
    extractCharset,
    extractTitle,
    isPublicIp,
    looksLikeAntiBot,
    parseMetaTags,
    parseOgMetadata,
    toRedditJsonUrl,
} from './unfurl';

beforeEach(() => lookup.mockReset());

describe('isPublicIp (SSRF guard)', () => {
    it('accepts public IPv4', () => {
        expect(isPublicIp('1.1.1.1')).toBe(true);
        expect(isPublicIp('93.184.216.34')).toBe(true);
    });

    it('rejects RFC1918 private ranges', () => {
        expect(isPublicIp('10.0.0.1')).toBe(false);
        expect(isPublicIp('172.16.5.4')).toBe(false);
        expect(isPublicIp('192.168.1.1')).toBe(false);
    });

    it('rejects loopback and link-local', () => {
        expect(isPublicIp('127.0.0.1')).toBe(false);
        expect(isPublicIp('169.254.0.1')).toBe(false);
    });

    it('rejects IPv6 loopback and ULA', () => {
        expect(isPublicIp('::1')).toBe(false);
        expect(isPublicIp('fc00::1')).toBe(false);
        expect(isPublicIp('fe80::1')).toBe(false);
    });

    it('accepts public IPv6', () => {
        expect(isPublicIp('2606:4700:4700::1111')).toBe(true);
    });

    it('rejects garbage', () => {
        expect(isPublicIp('not-an-ip')).toBe(false);
    });
});

describe('assertPublicHostname', () => {
    it('blocks localhost and reserved suffixes', async () => {
        await expect(assertPublicHostname('localhost')).rejects.toThrow();
        await expect(assertPublicHostname('foo.local')).rejects.toThrow();
        await expect(assertPublicHostname('svc.internal')).rejects.toThrow();
        await expect(assertPublicHostname('x.test')).rejects.toThrow();
        await expect(assertPublicHostname('y.invalid')).rejects.toThrow();
    });

    it('blocks private IP literals without DNS', async () => {
        await expect(assertPublicHostname('192.168.0.5')).rejects.toThrow();
        expect(lookup).not.toHaveBeenCalled();
    });

    it('allows a public IP literal', async () => {
        await expect(assertPublicHostname('1.1.1.1')).resolves.toBeUndefined();
        expect(lookup).not.toHaveBeenCalled();
    });

    it('resolves DNS and blocks when any address is private', async () => {
        lookup.mockResolvedValue([{ address: '10.0.0.1', family: 4 }]);
        await expect(assertPublicHostname('evil.example.com')).rejects.toThrow(/Blocked resolved IP/);
    });

    it('allows a host that resolves to a public address', async () => {
        lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
        await expect(assertPublicHostname('public.example.com')).resolves.toBeUndefined();
    });

    it('throws when DNS returns nothing', async () => {
        lookup.mockResolvedValue([]);
        await expect(assertPublicHostname('void.example.com')).rejects.toThrow(/no addresses/);
    });
});

describe('decodeHtmlEntities', () => {
    it('decodes named, decimal and hex entities', () => {
        expect(decodeHtmlEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
        expect(decodeHtmlEntities('&quot;hi&quot;')).toBe('"hi"');
        expect(decodeHtmlEntities('&#65;&#66;')).toBe('AB');
        expect(decodeHtmlEntities('&#x41;&#x42;')).toBe('AB');
    });

    it('resolves &amp; last so &amp;lt; does not double-decode', () => {
        expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;');
    });
});

describe('extractCharset', () => {
    it('reads charset from content-type', () => {
        expect(extractCharset('text/html; charset=ISO-8859-1', Buffer.from(''))).toBe('iso-8859-1');
    });

    it('falls back to a meta charset tag', () => {
        const html = Buffer.from('<html><head><meta charset="UTF-16"></head>');
        expect(extractCharset('text/html', html)).toBe('utf-16');
    });

    it('defaults to utf-8', () => {
        expect(extractCharset('text/html', Buffer.from('<html>'))).toBe('utf-8');
    });
});

describe('extractTitle', () => {
    it('extracts and collapses whitespace', () => {
        expect(extractTitle('<title>  Hello\n  World </title>')).toBe('Hello World');
    });

    it('returns undefined when absent', () => {
        expect(extractTitle('<html></html>')).toBeUndefined();
    });
});

describe('parseMetaTags / parseOgMetadata', () => {
    it('parses property and name meta tags, first-wins', () => {
        const html = `
            <meta property="og:title" content="First">
            <meta property="og:title" content="Second">
            <meta name="description" content="Desc">`;
        const meta = parseMetaTags(html);
        expect(meta.get('og:title')).toBe('First');
        expect(meta.get('description')).toBe('Desc');
    });

    it('builds metadata with og fallbacks and absolute image URL', () => {
        const html = `
            <meta property="og:title" content="Title">
            <meta property="og:description" content="A description">
            <meta property="og:image" content="/img/cover.png">
            <meta property="og:site_name" content="Example">`;
        const md = parseOgMetadata(html, 'https://example.com/post');
        expect(md.title).toBe('Title');
        expect(md.description).toBe('A description');
        expect(md.site_name).toBe('Example');
        expect(md.image_url).toBe('https://example.com/img/cover.png');
        expect(md.url).toBe('https://example.com/post');
    });

    it('falls back to <title> then hostname when no og:title', () => {
        expect(parseOgMetadata('<title>Doc Title</title>', 'https://example.com/x').title).toBe('Doc Title');
        expect(parseOgMetadata('<html></html>', 'https://example.com/x').title).toBe('example.com');
    });
});

describe('looksLikeAntiBot', () => {
    it('detects common verification interstitials', () => {
        expect(looksLikeAntiBot('Just a moment...')).toBe(true);
        expect(looksLikeAntiBot('Attention Required! | Cloudflare')).toBe(true);
        expect(looksLikeAntiBot('Normal Article Title')).toBe(false);
    });
});

describe('toRedditJsonUrl', () => {
    it('maps a comments permalink to the canonical JSON endpoint', () => {
        const out = toRedditJsonUrl('https://www.reddit.com/r/sub/comments/abc123/title/');
        expect(out).toBe('https://www.reddit.com/comments/abc123.json?raw_json=1');
    });

    it('maps a gallery link to the JSON endpoint', () => {
        const out = toRedditJsonUrl('https://www.reddit.com/gallery/xyz789');
        expect(out).toBe('https://www.reddit.com/comments/xyz789.json?raw_json=1');
    });

    it('returns null only for an unparseable URL', () => {
        expect(toRedditJsonUrl('::::not a url')).toBeNull();
    });
});
