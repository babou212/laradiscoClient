import { beforeEach, describe, expect, it, vi } from 'vitest';
import { navigateToNotification, type AppNotification } from './notifications';

const push = vi.fn();
const selectChannel = vi.fn();
const openThreadById = vi.fn();

vi.mock('@/router', () => ({ default: { push: (...a: unknown[]) => push(...a) } }));
vi.mock('@/i18n', () => ({ t: (k: string) => k }));
vi.mock('@/lib/echo', () => ({ getEcho: vi.fn() }));
vi.mock('@/api/inbox', () => ({ ackInbox: vi.fn() }));
vi.mock('@/api/notifications', () => ({
    getNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
}));
vi.mock('@/stores/chat', () => ({ useChatStore: () => ({ selectChannel }) }));
vi.mock('@/stores/thread', () => ({ useThreadStore: () => ({ openThreadById }) }));

function makeNotification(data: Partial<AppNotification['data']>): AppNotification {
    return {
        id: 'n1',
        type: 'X',
        data: { message_id: 1, sender_id: 2, sender_username: 'a', sender_avatar: null, content: 'hi', ...data },
        read_at: null,
        created_at: '2026-01-01T00:00:00Z',
    };
}

beforeEach(() => {
    push.mockReset().mockResolvedValue(undefined);
    selectChannel.mockReset().mockResolvedValue(undefined);
    openThreadById.mockReset().mockResolvedValue(undefined);
});

describe('navigateToNotification', () => {
    it('routes a thread reply to home, selects the channel, and opens the thread', async () => {
        await navigateToNotification(
            makeNotification({ notification_type: 'thread_reply', channel_id: 10, thread_id: 5 }),
        );

        expect(selectChannel).toHaveBeenCalledWith(10);
        expect(push).toHaveBeenCalledWith({ name: 'home' });
        expect(openThreadById).toHaveBeenCalledWith(10, 5);
        // It must NOT strand the user on the thread-less chat route.
        expect(push).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'chat' }));
    });

    it('routes a channel mention to home and selects the channel without opening a thread', async () => {
        await navigateToNotification(makeNotification({ channel_id: 10, mention_type: 'user' }));

        expect(selectChannel).toHaveBeenCalledWith(10);
        expect(push).toHaveBeenCalledWith({ name: 'home' });
        expect(openThreadById).not.toHaveBeenCalled();
    });

    it('routes a direct message to the DM view', async () => {
        await navigateToNotification(makeNotification({ notification_type: 'direct_message', dm_group_id: 7 }));

        expect(push).toHaveBeenCalledWith({ name: 'direct-messages', params: { threadId: 7 } });
        expect(selectChannel).not.toHaveBeenCalled();
        expect(openThreadById).not.toHaveBeenCalled();
    });
});
