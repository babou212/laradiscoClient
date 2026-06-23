import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, isSupportedLocale, SUPPORTED_LOCALES } from './index';

describe('isSupportedLocale', () => {
    it('returns true for every supported locale', () => {
        for (const locale of SUPPORTED_LOCALES) {
            expect(isSupportedLocale(locale)).toBe(true);
        }
    });

    it('returns false for unknown strings', () => {
        expect(isSupportedLocale('xx')).toBe(false);
        expect(isSupportedLocale('EN')).toBe(false);
    });

    it('returns false for non-string values', () => {
        expect(isSupportedLocale(undefined)).toBe(false);
        expect(isSupportedLocale(42)).toBe(false);
        expect(isSupportedLocale(null)).toBe(false);
    });

    it('includes the default locale', () => {
        expect(SUPPORTED_LOCALES).toContain(DEFAULT_LOCALE);
    });
});
