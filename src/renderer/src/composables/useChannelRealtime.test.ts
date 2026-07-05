import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, ref } from 'vue';
import { createFakeEcho } from '@/../../../test/helpers/echo';
import { useChatStore } from '@/stores/chat';
import type { MessageData } from '@/types/chat';
import { useChannelRealtime } from './useChannelRealtime';

// A single stable fake echo so we can pull the registered listener back out.
const echo = createFakeEcho();
vi.mock('@/lib/echo', () => ({ getEcho: () => echo }));

function msg(overrides: Partial<MessageData> = {}): MessageData {
    return {
        id: 's1',
        content: 'hello',
        is_edited: false,
        edited_at: null,
        deleted_at: null,
        reply_to_id: null,
        user: { id: '7', username: 'alice', avatar_urls: null },
        reactions: [],
        created_at: '2026-06-23T10:00:00Z',
        ...overrides,
    };
}

/**
 * Mount useChannelRealtime wired to a real chat store and return a handle that
 * fires the registered `MessageSent` broadcast callback.
 */
function driveRealtime() {
    const chat = useChatStore();
    const options = {
        channelId: ref<string | undefined>('10'),
        isDm: ref(false),
        messages: computed(() => chat.messages),
        isLoadingMessages: computed(() => false),
        isViewingHistory: ref(false),
        addMessage: chat.addMessage,
        updateMessage: chat.updateMessage,
        removeMessage: chat.removeMessage,
        notifyNewMessage: vi.fn(),
        resetForNewChannel: vi.fn(),
        handleTypingEvent: vi.fn(),
        clearTypingUser: vi.fn(),
        clearAll: vi.fn(),
        pinnedMessages: ref<MessageData[]>([]),
        showPinnedMessages: ref(false),
        fetchAndDecryptPinned: vi.fn(),
    };
    const Comp = defineComponent({
        setup() {
            useChannelRealtime(options);
            return () => null;
        },
    });
    mount(Comp);
    const call = echo.__channel.listen.mock.calls.find((c) => c[0] === 'MessageSent');
    if (!call) throw new Error('MessageSent listener was not registered');
    const emit = (message: MessageData) => (call[1] as (d: { message: MessageData }) => void)({ message });
    return { chat, emit };
}

beforeEach(() => {
    setActivePinia(createPinia());
    echo.__channel.listen.mockClear();
});

describe('useChannelRealtime MessageSent reconciliation', () => {
    it('ignores a broadcast whose server id is already present', () => {
        const { chat, emit } = driveRealtime();
        chat.messages.push(msg({ id: 's1' }));

        emit(msg({ id: 's1', content: 'dup' }));

        expect(chat.messages).toHaveLength(1);
        expect(chat.messages[0].content).toBe('hello');
    });

    it('upgrades the optimistic copy in place when the sender receives its own broadcast', () => {
        const { chat, emit } = driveRealtime();
        // Optimistic copy: keyed by client_temp_id, temp id != server id.
        chat.messages.push(msg({ id: 'temp-uuid', client_temp_id: 'ctid-1' }));

        emit(msg({ id: 's99', client_temp_id: 'ctid-1' }));

        // Replaced in place — one entry, now carrying the server id.
        expect(chat.messages).toHaveLength(1);
        expect(chat.messages[0].id).toBe('s99');
    });

    it('appends a genuinely new message from someone else', () => {
        const { chat, emit } = driveRealtime();
        chat.messages.push(msg({ id: 'temp-uuid', client_temp_id: 'mine' }));

        emit(msg({ id: 's2', client_temp_id: 'someone-else' }));

        expect(chat.messages.map((m) => m.id)).toEqual(['temp-uuid', 's2']);
    });
});
