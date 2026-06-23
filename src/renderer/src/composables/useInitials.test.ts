import { describe, expect, it } from 'vitest';
import { getInitials, useInitials } from './useInitials';

describe('getInitials', () => {
    it('returns empty string for empty/undefined input', () => {
        expect(getInitials()).toBe('');
        expect(getInitials('')).toBe('');
    });

    it('returns the first letter for a single name', () => {
        expect(getInitials('alice')).toBe('A');
    });

    it('returns first+last initials for a multi-word name', () => {
        expect(getInitials('Ada Lovelace')).toBe('AL');
        expect(getInitials('Jean Paul Sartre')).toBe('JS');
    });

    it('trims surrounding whitespace', () => {
        expect(getInitials('  Grace Hopper  ')).toBe('GH');
    });

    it('exposes getInitials through the composable', () => {
        expect(useInitials().getInitials('Test User')).toBe('TU');
    });
});
