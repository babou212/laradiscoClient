import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConnectionStore } from './connection';

// Mirrors the constants in connection.ts.
const RECONNECT_GRACE_MS = 2500;
const DOWN_ESCALATE_MS = 15_000;

beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('setRealtimeState', () => {
    it('stays connected through a momentary blip, then reconnecting, then disconnected', () => {
        const store = useConnectionStore();
        store.connect();
        expect(store.status).toBe('connected');

        store.setRealtimeState('unavailable');
        // Within the grace window we don't flash the banner.
        vi.advanceTimersByTime(RECONNECT_GRACE_MS - 1);
        expect(store.status).toBe('connected');

        vi.advanceTimersByTime(1);
        expect(store.status).toBe('reconnecting');

        vi.advanceTimersByTime(DOWN_ESCALATE_MS);
        expect(store.status).toBe('disconnected');
    });

    it('a connected signal at any point clears timers back to connected', () => {
        const store = useConnectionStore();
        store.connect();

        store.setRealtimeState('connecting');
        vi.advanceTimersByTime(RECONNECT_GRACE_MS);
        expect(store.status).toBe('reconnecting');

        store.setRealtimeState('connected');
        expect(store.status).toBe('connected');

        // No stale escalation fires after recovery.
        vi.advanceTimersByTime(DOWN_ESCALATE_MS);
        expect(store.status).toBe('connected');
    });

    it('does not restart the clock on repeated non-connected signals', () => {
        const store = useConnectionStore();
        store.connect();

        store.setRealtimeState('unavailable');
        vi.advanceTimersByTime(RECONNECT_GRACE_MS - 500);
        store.setRealtimeState('connecting');
        // The original grace timer still governs — 500ms more reaches it.
        vi.advanceTimersByTime(500);
        expect(store.status).toBe('reconnecting');
    });
});

describe('setNetworkOnline', () => {
    it('goes straight to disconnected when the network drops', () => {
        const store = useConnectionStore();
        store.connect();

        store.setNetworkOnline(false);
        expect(store.status).toBe('disconnected');
    });

    it('shows reconnecting when the network returns until the socket confirms', () => {
        const store = useConnectionStore();
        store.connect();

        store.setNetworkOnline(false);
        expect(store.status).toBe('disconnected');

        store.setNetworkOnline(true);
        vi.advanceTimersByTime(RECONNECT_GRACE_MS);
        expect(store.status).toBe('reconnecting');

        store.setRealtimeState('connected');
        expect(store.status).toBe('connected');
    });
});

describe('active guard', () => {
    it('setters no-op while inactive (after disconnect)', () => {
        const store = useConnectionStore();
        store.connect();
        store.disconnect();

        store.setRealtimeState('failed');
        store.setNetworkOnline(false);
        vi.advanceTimersByTime(RECONNECT_GRACE_MS + DOWN_ESCALATE_MS);
        expect(store.status).toBe('connected');
    });

    it('does not fire a pending timer after disconnect', () => {
        const store = useConnectionStore();
        store.connect();
        store.setRealtimeState('unavailable');
        store.disconnect();

        vi.advanceTimersByTime(RECONNECT_GRACE_MS + DOWN_ESCALATE_MS);
        expect(store.status).toBe('connected');
    });
});
