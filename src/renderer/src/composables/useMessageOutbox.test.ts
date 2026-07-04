import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sendDmMessage } from '@/api/direct-messages';
import { sendMessage as apiSendMessage } from '@/api/messages';
import { normalizeMessage } from '@/api/normalizers';
import { useChatStore } from '@/stores/chat';
import { useDirectMessagesStore } from '@/stores/directMessages';
import type { MessageData } from '@/types/chat';
import { useMessageOutbox, type OutboxEntry } from './useMessageOutbox';

vi.mock('@/api/messages', () => ({ sendMessage: vi.fn() }));
vi.mock('@/api/direct-messages', () => ({ sendDmMessage: vi.fn() }));
vi.mock('@/api/normalizers', () => ({ normalizeMessage: vi.fn() }));

function failedMsg(id: string): MessageData {
    return {
        id,
        client_temp_id: id,
        content: 'hi',
        is_edited: false,
        edited_at: null,
        deleted_at: null,
        reply_to_id: null,
        user: { id: 'me', username: 'me', avatar_urls: null },
        reactions: [],
        created_at: '2026-07-04T00:00:00.000Z',
        send_status: 'failed',
    };
}

function entryFor(id: string, isDm = false): OutboxEntry {
    return {
        clientTempId: id,
        channelId: '10',
        isDm,
        payload: { content: 'hi', client_temp_id: id },
        optimistic: failedMsg(id),
        createdAt: '2026-07-04T00:00:00.000Z',
    };
}

beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
});

describe('useMessageOutbox.retry', () => {
    it('re-POSTs with the original client_temp_id, reconciles, and clears the outbox on success', async () => {
        const serverMsg: MessageData = { ...failedMsg('ct-1'), id: 'server-1', send_status: undefined };
        vi.mocked(apiSendMessage).mockResolvedValue({ data: {}, included: [] } as never);
        vi.mocked(normalizeMessage).mockReturnValue(serverMsg);

        const chat = useChatStore();
        chat.messages.push(failedMsg('ct-1'));

        const outbox = useMessageOutbox();
        await outbox.enqueue(entryFor('ct-1'));
        await outbox.retry('ct-1');

        expect(apiSendMessage).toHaveBeenCalledWith('10', expect.objectContaining({ client_temp_id: 'ct-1' }));
        expect(chat.messages.map((m) => m.id)).toEqual(['server-1']);
        expect(chat.messages[0].send_status).toBeUndefined();
        expect(window.api.outbox.remove).toHaveBeenCalledWith('ct-1');
    });

    it('routes DM retries to the DM endpoint', async () => {
        vi.mocked(sendDmMessage).mockResolvedValue({ data: {}, included: [] } as never);
        vi.mocked(normalizeMessage).mockReturnValue({ ...failedMsg('ct-dm'), id: 'server-dm', send_status: undefined });

        const dm = useDirectMessagesStore();
        dm.messages.push(failedMsg('ct-dm'));

        const outbox = useMessageOutbox();
        await outbox.enqueue(entryFor('ct-dm', true));
        await outbox.retry('ct-dm');

        expect(sendDmMessage).toHaveBeenCalledWith('10', expect.objectContaining({ client_temp_id: 'ct-dm' }));
        expect(apiSendMessage).not.toHaveBeenCalled();
    });

    it('keeps the message failed, re-persists the error, and rethrows on failure', async () => {
        vi.mocked(apiSendMessage).mockRejectedValue(new Error('network down'));

        const chat = useChatStore();
        chat.messages.push(failedMsg('ct-2'));

        const outbox = useMessageOutbox();
        await outbox.enqueue(entryFor('ct-2'));
        vi.mocked(window.api.outbox.enqueue).mockClear();

        await expect(outbox.retry('ct-2')).rejects.toThrow('network down');

        expect(chat.messages[0].send_status).toBe('failed');
        expect(window.api.outbox.remove).not.toHaveBeenCalled();
        expect(window.api.outbox.enqueue).toHaveBeenCalledWith(expect.objectContaining({ error: 'network down' }));
    });

    it('falls back to window.api.outbox.get when the row is not cached (post-restart)', async () => {
        vi.mocked(apiSendMessage).mockResolvedValue({ data: {}, included: [] } as never);
        vi.mocked(normalizeMessage).mockReturnValue({
            ...failedMsg('ct-cold'),
            id: 'server-cold',
            send_status: undefined,
        });
        vi.mocked(window.api.outbox.get).mockResolvedValue({
            client_temp_id: 'ct-cold',
            channel_id: '10',
            is_dm: false,
            is_thread: false,
            thread_message_id: null,
            payload: JSON.stringify({ content: 'hi', client_temp_id: 'ct-cold' }),
            optimistic: JSON.stringify(failedMsg('ct-cold')),
            error: 'HTTP 500',
            created_at: '2026-07-04T00:00:00.000Z',
        });

        const chat = useChatStore();
        chat.messages.push(failedMsg('ct-cold'));

        const outbox = useMessageOutbox();
        await outbox.retry('ct-cold');

        expect(window.api.outbox.get).toHaveBeenCalledWith('ct-cold');
        expect(apiSendMessage).toHaveBeenCalledWith('10', expect.objectContaining({ client_temp_id: 'ct-cold' }));
        expect(window.api.outbox.remove).toHaveBeenCalledWith('ct-cold');
    });
});
