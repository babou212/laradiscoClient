import { describe, expect, it } from 'vitest';
import { normalizeUrl } from './urlNormalize';

describe('normalizeUrl', () => {
    it('strips known tracking params while keeping real ones', () => {
        const out = normalizeUrl('https://example.com/p?utm_source=x&fbclid=y&gclid=z&q=keep&page=2');
        const url = new URL(out);
        expect(url.searchParams.has('utm_source')).toBe(false);
        expect(url.searchParams.has('fbclid')).toBe(false);
        expect(url.searchParams.has('gclid')).toBe(false);
        expect(url.searchParams.get('q')).toBe('keep');
        expect(url.searchParams.get('page')).toBe('2');
    });

    it('strips every tracking param in the blocklist', () => {
        const tracking = [
            'utm_source',
            'utm_medium',
            'utm_campaign',
            'utm_term',
            'utm_content',
            'utm_id',
            'utm_name',
            'fbclid',
            'gclid',
            'gclsrc',
            'dclid',
            'msclkid',
            'mc_eid',
            'mc_cid',
            '_ga',
            'igshid',
            'ref',
            'ref_src',
            'ref_url',
        ];
        const qs = tracking.map((k) => `${k}=v`).join('&');
        const out = normalizeUrl(`https://example.com/?${qs}&keep=1`);
        const params = new URL(out).searchParams;
        for (const k of tracking) expect(params.has(k)).toBe(false);
        expect(params.get('keep')).toBe('1');
    });

    it('matches tracking params case-insensitively', () => {
        const out = normalizeUrl('https://example.com/?UTM_SOURCE=x&keep=1');
        expect(new URL(out).searchParams.has('UTM_SOURCE')).toBe(false);
    });

    it('lowercases hostname and protocol', () => {
        const out = normalizeUrl('HTTPS://Example.COM/Path');
        expect(out.startsWith('https://example.com/Path')).toBe(true);
    });

    it('clears the hash fragment', () => {
        expect(normalizeUrl('https://example.com/x#section')).toBe('https://example.com/x');
    });

    it('drops the default https port 443', () => {
        expect(normalizeUrl('https://example.com:443/x')).toBe('https://example.com/x');
    });

    it('drops the default http port 80', () => {
        expect(normalizeUrl('http://example.com:80/x')).toBe('http://example.com/x');
    });

    it('keeps non-default ports', () => {
        expect(normalizeUrl('https://example.com:8443/x')).toBe('https://example.com:8443/x');
    });

    it('is idempotent', () => {
        const once = normalizeUrl('https://Example.com:443/x?utm_source=a&b=2#h');
        expect(normalizeUrl(once)).toBe(once);
    });

    it('throws on an invalid URL', () => {
        expect(() => normalizeUrl('not a url')).toThrow();
    });
});
