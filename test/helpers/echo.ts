import { vi } from 'vitest';

/**
 * A chainable fake Laravel Echo channel so `getEcho().private(x).listen(...)`
 * call chains in stores/composables don't throw. `listen`/`stopListening`
 * return the channel for fluent chaining.
 */
export function createFakeChannel() {
    const channel: Record<string, ReturnType<typeof vi.fn>> = {};
    channel.listen = vi.fn(() => channel);
    channel.stopListening = vi.fn(() => channel);
    channel.notification = vi.fn(() => channel);
    channel.subscribed = vi.fn(() => channel);
    channel.error = vi.fn(() => channel);
    channel.here = vi.fn(() => channel);
    channel.joining = vi.fn(() => channel);
    channel.leaving = vi.fn(() => channel);
    channel.whisper = vi.fn(() => channel);
    return channel;
}

export function createFakeEcho() {
    const channel = createFakeChannel();
    return {
        private: vi.fn(() => channel),
        channel: vi.fn(() => channel),
        join: vi.fn(() => channel),
        leave: vi.fn(),
        leaveChannel: vi.fn(),
        disconnect: vi.fn(),
        socketId: vi.fn(() => 'test-socket-id'),
        connector: { pusher: { connection: { socket_id: 'test-socket-id' } } },
        __channel: channel,
    };
}

/**
 * Default `vi.mock('@/lib/echo', echoMockFactory)` factory. Returns a stable
 * fake echo instance plus stubbed lifecycle helpers.
 */
export function echoMockFactory() {
    const echo = createFakeEcho();
    return {
        getEcho: vi.fn(() => echo),
        getSocketId: vi.fn(() => undefined),
        initEcho: vi.fn(),
        disconnectEcho: vi.fn(),
        isEchoConnected: vi.fn(() => false),
    };
}
