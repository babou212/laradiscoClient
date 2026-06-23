import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from './chat';
import { useInboxStore } from './inbox';

const getInbox = vi.fn();
const ackInbox = vi.fn();
vi.mock('@/api/inbox', () => ({
    getInbox: (...a: unknown[]) => getInbox(...a),
    ackInbox: (...a: unknown[]) => ackInbox(...a),
}));
vi.mock('@/lib/echo', async () => (await import('@/../../../test/helpers/echo')).echoMockFactory());
vi.mock('@/api/messages', () => ({ getMessages: vi.fn() }));
vi.mock('@/api/categories', () => ({ getCategories: vi.fn() }));
vi.mock('@/api/channels', () => ({ getChannel: vi.fn(), markChannelRead: vi.fn() }));
vi.mock('@/api/direct-messages', () => ({ getDmGroups: vi.fn(), getDirectMessages: vi.fn() }));

beforeEach(() => {
    setActivePinia(createPinia());
    getInbox.mockReset();
    ackInbox.mockReset().mockResolvedValue(undefined);
});

describe('drain', () => {
    it('does nothing when the inbox is empty', async () => {
        getInbox.mockResolvedValue({ data: [] });
        await useInboxStore().drain();
        expect(ackInbox).not.toHaveBeenCalled();
    });

    it('flags an unread channel for a buffered channel message and acks it', async () => {
        getInbox.mockResolvedValue({
            data: [
                {
                    message_type: 'channel',
                    message_id: 'm1',
                    payload: { id: 1, channel_id: 10, user: { id: 2, username: 'a' } },
                },
            ],
        });
        const chat = useChatStore();
        const spy = vi.spyOn(chat, 'setChannelUnread');
        await useInboxStore().drain();

        expect(spy).toHaveBeenCalledWith('10', true);
        expect(ackInbox).toHaveBeenCalledWith([{ message_type: 'channel', message_id: 'm1' }]);
    });

    it('guards against overlapping drains', async () => {
        let resolveInbox!: (v: unknown) => void;
        getInbox.mockReturnValue(new Promise((r) => (resolveInbox = r)));
        const inbox = useInboxStore();
        const p1 = inbox.drain();
        const p2 = inbox.drain(); // should early-return while the first is in flight
        resolveInbox({ data: [] });
        await Promise.all([p1, p2]);
        expect(getInbox).toHaveBeenCalledTimes(1);
    });
});
