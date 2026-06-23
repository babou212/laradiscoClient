import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { messageResource, rel, userResource } from '@/../../../test/helpers/jsonapi';
import { useChatStore } from './chat';
import { useUsersStore } from './users';

const getMessages = vi.fn();
vi.mock('@/api/messages', () => ({ getMessages: (...a: unknown[]) => getMessages(...a) }));
vi.mock('@/api/categories', () => ({ getCategories: vi.fn() }));
vi.mock('@/api/channels', () => ({ getChannel: vi.fn(), markChannelRead: vi.fn() }));
vi.mock('@/lib/echo', async () => (await import('@/../../../test/helpers/echo')).echoMockFactory());

function page(ids: string[], meta: Record<string, unknown>) {
    return {
        data: ids.map((id) => messageResource(id, { content: `m${id}` }, { user: rel('users', 'u1') })),
        included: [userResource('u1', { username: 'alice' })],
        meta,
    };
}

beforeEach(() => {
    setActivePinia(createPinia());
    getMessages.mockReset();
});

describe('addMessage', () => {
    it('appends a new message and hydrates its author', () => {
        const chat = useChatStore();
        const users = useUsersStore();
        const spy = vi.spyOn(users, 'hydrateFromUsers');
        chat.addMessage({ id: '1', content: 'hi', user: { id: 'u1', username: 'a' } } as never);
        expect(chat.messages).toHaveLength(1);
        expect(spy).toHaveBeenCalled();
    });

    it('does not add a duplicate id', () => {
        const chat = useChatStore();
        const msg = { id: '1', content: 'hi', user: { id: 'u1', username: 'a' } } as never;
        chat.addMessage(msg);
        chat.addMessage(msg);
        expect(chat.messages).toHaveLength(1);
    });
});

describe('updateMessage / removeMessage', () => {
    it('marks a message edited', () => {
        const chat = useChatStore();
        chat.addMessage({ id: '1', content: 'old', user: { id: 'u1', username: 'a' } } as never);
        chat.updateMessage({ id: '1', content: 'new', edited_at: '2026-01-01' } as never);
        expect(chat.messages[0].content).toBe('new');
        expect(chat.messages[0].is_edited).toBe(true);
    });

    it('removes a message by id', () => {
        const chat = useChatStore();
        chat.addMessage({ id: '1', content: 'x', user: { id: 'u1', username: 'a' } } as never);
        chat.removeMessage('1');
        expect(chat.messages).toHaveLength(0);
    });
});

describe('fetchMessages pagination', () => {
    it('loads messages and sets pagination edges from meta', async () => {
        getMessages.mockResolvedValue(
            page(['1', '2', '3'], { has_more_before: true, has_more_after: false, oldest_id: 1, newest_id: 3 }),
        );
        const chat = useChatStore();
        await chat.fetchMessages('10');

        expect(chat.messages.map((m) => m.id)).toEqual(['1', '2', '3']);
        expect(chat.hasMoreBefore).toBe(true);
        expect(chat.hasMoreAfter).toBe(false);
        expect(chat.isViewingHistory).toBe(false);
        expect(chat.isLoadingMessages).toBe(false);
    });

    it('prepends older messages and updates the oldest edge', async () => {
        const chat = useChatStore();
        // Seed current channel + initial window.
        getMessages.mockResolvedValueOnce(
            page(['5', '6'], { has_more_before: true, has_more_after: false, oldest_id: 5, newest_id: 6 }),
        );
        // selectChannel falls back to getChannel; call fetchMessages directly and set channel.
        await chat.fetchMessages('10');
        chat.$patch({ currentChannel: { id: '10', name: 'c', topic: null, type: 'text' } } as never);

        getMessages.mockResolvedValueOnce(
            page(['3', '4'], { has_more_before: false, has_more_after: false, oldest_id: 3, newest_id: 4 }),
        );
        await chat.loadOlderMessages();

        expect(chat.messages.map((m) => m.id)).toEqual(['3', '4', '5', '6']);
        expect(chat.hasMoreBefore).toBe(false);
    });

    it('appends newer messages and updates the newest edge', async () => {
        const chat = useChatStore();
        getMessages.mockResolvedValueOnce(
            page(['5', '6'], { has_more_before: false, has_more_after: true, oldest_id: 5, newest_id: 6 }),
        );
        await chat.fetchMessages('10');
        chat.$patch({ currentChannel: { id: '10', name: 'c', topic: null, type: 'text' } } as never);

        getMessages.mockResolvedValueOnce(
            page(['7', '8'], { has_more_before: false, has_more_after: false, oldest_id: 7, newest_id: 8 }),
        );
        await chat.loadNewerMessages();

        expect(chat.messages.map((m) => m.id)).toEqual(['5', '6', '7', '8']);
        expect(chat.hasMoreAfter).toBe(false);
    });
});

describe('setChannelUnread', () => {
    it('flips the unread flag on a category channel', () => {
        const chat = useChatStore();
        chat.$patch({
            categories: [
                { id: 'c1', name: 'General', position: 0, channels: [{ id: '10', name: 'gen', has_unread: false }] },
            ],
        } as never);
        chat.setChannelUnread('10', true);
        expect(chat.categories[0].channels[0].has_unread).toBe(true);
    });
});
