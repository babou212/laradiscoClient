import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { withSetup } from '@/../../../test/helpers/withSetup';
import { useTypingIndicator } from './useTypingIndicator';

const sendChannelTyping = vi.fn();
const sendDmTyping = vi.fn();
vi.mock('@/api/typing', () => ({
    sendChannelTyping: (...a: unknown[]) => sendChannelTyping(...a),
    sendDmTyping: (...a: unknown[]) => sendDmTyping(...a),
}));

beforeEach(() => {
    vi.useFakeTimers();
    sendChannelTyping.mockReset().mockResolvedValue(undefined);
    sendDmTyping.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.useRealTimers());

function setup(currentUserId = 99) {
    return withSetup(() =>
        useTypingIndicator(ref<string | number>(7), ref(false), ref<string | number>(currentUserId)),
    );
}

describe('handleTypingEvent', () => {
    it('adds a typing user and auto-expires after 3s', () => {
        const { result } = setup();
        result.handleTypingEvent({ user_id: 1, username: 'alice', is_typing: true });
        expect(result.typingUsers.has(1)).toBe(true);

        vi.advanceTimersByTime(3000);
        expect(result.typingUsers.has(1)).toBe(false);
    });

    it('ignores the current user typing', () => {
        const { result } = setup(1);
        result.handleTypingEvent({ user_id: 1, username: 'me', is_typing: true });
        expect(result.typingUsers.has(1)).toBe(false);
    });

    it('removes a user on is_typing:false', () => {
        const { result } = setup();
        result.handleTypingEvent({ user_id: 2, username: 'bob', is_typing: true });
        result.handleTypingEvent({ user_id: 2, username: 'bob', is_typing: false });
        expect(result.typingUsers.has(2)).toBe(false);
    });
});

describe('emitTyping', () => {
    it('calls the channel typing API and debounces subsequent calls for 2s', () => {
        const { result } = setup();
        result.emitTyping();
        result.emitTyping();
        expect(sendChannelTyping).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(2000);
        result.emitTyping();
        expect(sendChannelTyping).toHaveBeenCalledTimes(2);
    });
});

describe('cleanup', () => {
    it('clears all timers on unmount', () => {
        const { result, unmount } = setup();
        result.handleTypingEvent({ user_id: 3, username: 'c', is_typing: true });
        expect(() => unmount()).not.toThrow();
        vi.advanceTimersByTime(5000);
    });
});
