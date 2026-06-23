import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withSetup } from '@/../../../test/helpers/withSetup';
import { useRateLimit } from './useRateLimit';

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-23T12:00:00Z'));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('useRateLimit', () => {
    it('starts a cooldown and reports rate-limited state', () => {
        const { result } = withSetup(() => useRateLimit());
        result.startRateLimitCooldown(5);
        expect(result.isRateLimited.value).toBe(true);
        expect(result.rateLimitCountdown.value).toBe(5);
        expect(result.sendError.value).toContain('5');
    });

    it('counts down each second and clears at expiry', () => {
        const { result } = withSetup(() => useRateLimit());
        result.startRateLimitCooldown(3);

        vi.advanceTimersByTime(1000);
        expect(result.rateLimitCountdown.value).toBe(2);

        vi.advanceTimersByTime(2000);
        expect(result.isRateLimited.value).toBe(false);
        expect(result.rateLimitCountdown.value).toBe(0);
        expect(result.sendError.value).toBeNull();
    });

    it('clears the interval on unmount without throwing', () => {
        const { result, unmount } = withSetup(() => useRateLimit());
        result.startRateLimitCooldown(10);
        expect(() => unmount()).not.toThrow();
        // Advancing past unmount must not blow up.
        vi.advanceTimersByTime(20000);
    });
});
