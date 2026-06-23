import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cn, formatLocalizedDate, formatMessageDate } from './utils';

// All assertions assume TZ=UTC (set in the renderer setup file).
beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-23T12:00:00Z'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('cn', () => {
    it('merges and dedupes tailwind classes', () => {
        const showHidden = false;
        expect(cn('p-2', 'p-4')).toBe('p-4');
        expect(cn('text-sm', showHidden && 'hidden', 'font-bold')).toBe('text-sm font-bold');
    });
});

describe('formatMessageDate', () => {
    it('formats a same-day timestamp as "Today at ..."', () => {
        expect(formatMessageDate('2026-06-23T09:30:00Z')).toMatch(/^Today at /);
    });

    it('formats a previous-day timestamp as "Yesterday at ..."', () => {
        expect(formatMessageDate('2026-06-22T09:30:00Z')).toMatch(/^Yesterday at /);
    });

    it('formats older timestamps as MM/dd/yyyy', () => {
        expect(formatMessageDate('2026-01-05T09:30:00Z')).toBe('01/05/2026');
    });

    it('returns an empty string for null/invalid input', () => {
        expect(formatMessageDate(null)).toBe('');
        expect(formatMessageDate('')).toBe('');
        expect(formatMessageDate('not a date')).toBe('');
    });

    it('accepts epoch seconds and milliseconds', () => {
        const seconds = Math.floor(new Date('2026-06-23T08:00:00Z').getTime() / 1000);
        expect(formatMessageDate(seconds)).toMatch(/^Today at /);
        expect(formatMessageDate(new Date('2026-06-23T08:00:00Z').getTime())).toMatch(/^Today at /);
    });
});

describe('formatLocalizedDate', () => {
    it('returns empty string for null', () => {
        expect(formatLocalizedDate(null)).toBe('');
    });

    it('formats a valid date', () => {
        expect(formatLocalizedDate('2026-06-23T12:00:00Z')).toContain('2026');
    });
});
