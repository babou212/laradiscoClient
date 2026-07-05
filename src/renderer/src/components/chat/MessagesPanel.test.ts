import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import type * as VueRouter from 'vue-router';
import { normalizeMessage } from '@/api/normalizers';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import type { MessageData } from '@/types/chat';
import MessagesPanel from './MessagesPanel.vue';

// --- echo + api edges the stores / panel reach into ---
vi.mock('@/lib/echo', async () => (await import('@/../../../test/helpers/echo')).echoMockFactory());

const apiSendMessage = vi.fn();
const apiEditMessage = vi.fn();
const apiDeleteMessage = vi.fn();
vi.mock('@/api/messages', () => ({
    sendMessage: (...a: unknown[]) => apiSendMessage(...a),
    editMessage: (...a: unknown[]) => apiEditMessage(...a),
    deleteMessage: (...a: unknown[]) => apiDeleteMessage(...a),
    getMessages: vi.fn(),
}));
vi.mock('@/api/direct-messages', () => ({
    sendDmMessage: vi.fn(),
    editDmMessage: vi.fn(),
    deleteDmMessage: vi.fn(),
}));
vi.mock('@/api/attachments', () => ({ uploadChannelAttachment: vi.fn(), uploadDmAttachment: vi.fn() }));
vi.mock('@/api/reactions', () => ({ toggleChannelReaction: vi.fn(), toggleDmReaction: vi.fn() }));
vi.mock('@/api/normalizers', () => ({ normalizeMessage: vi.fn(), coerceBroadcastMessage: vi.fn() }));

// --- heavy composables stubbed to no-ops so the mount is tractable ---
const jumpToBottom = vi.fn();
const jumpToMessage = vi.fn();
const scrollToBottom = vi.fn();
vi.mock('@/composables/useChatScroll', async () => {
    const { shallowRef } = await import('vue');
    return {
        useChatScroll: () => ({
            pinnedToBottom: shallowRef(true),
            unreadNewCount: shallowRef(0),
            isLoadingOlder: shallowRef(false),
            isLoadingNewer: shallowRef(false),
            scrollToBottom,
            jumpToBottom,
            jumpToMessage,
            notifyNewMessage: vi.fn(),
            resetForNewConversation: vi.fn(),
        }),
    };
});
vi.mock('@/composables/useChannelRealtime', () => ({ useChannelRealtime: vi.fn() }));
vi.mock('@/composables/usePinnedMessages', async () => {
    const { ref, shallowRef } = await import('vue');
    return {
        usePinnedMessages: () => ({
            pinnedMessages: ref([]),
            showPinnedMessages: shallowRef(false),
            isLoadingPinned: shallowRef(false),
            fetchAndDecryptPinned: vi.fn(),
            togglePinnedPanel: vi.fn(),
            togglePin: vi.fn(),
            unpinFromPanel: vi.fn(),
        }),
    };
});

const routerPush = vi.fn();
vi.mock('vue-router', async (importOriginal) => ({
    ...(await importOriginal<typeof VueRouter>()),
    useRouter: (): Pick<VueRouter.Router, 'push'> => ({ push: routerPush }),
    useRoute: () => ({ query: {} }),
}));

// Minimal Message stub exposing the buttons we drive emits through.
const MessageStub = {
    props: ['message'],
    emits: ['start-edit', 'cancel-edit', 'save-edit', 'delete', 'reply', 'open-thread', 'toggle-reaction'],
    template: `<div class="message" :data-id="message.id">
        <button class="reply-btn" @click="$emit('reply')">reply</button>
        <button class="delete-btn" @click="$emit('delete')">delete</button>
        <button class="thread-btn" @click="$emit('open-thread')">thread</button>
    </div>`,
};

const stubs = {
    Message: MessageStub,
    MessageInput: {
        name: 'MessageInput',
        template: '<div class="message-input" />',
        emits: ['send', 'typing', 'cancel-reply'],
    },
    MessageListSkeleton: { template: '<div class="skeleton" />' },
    NewMessagePill: { template: '<button class="pill" @click="$emit(\'click\')" />' },
    TypingIndicator: true,
    NotificationBell: true,
    PinnedMessagesPanel: true,
    SearchMessages: true,
    UserProfilePanel: true,
    SimpleTooltip: { template: '<div><slot /></div>' },
};

const channel = { id: '10', name: 'general', topic: 'a topic' };

function mountPanel(props: Record<string, unknown> = {}) {
    return mount(MessagesPanel, {
        props: { channel, ...props },
        global: { stubs },
    });
}

function seedUser(): void {
    const auth = useAuthStore();
    auth.user = { id: 'u1', username: 'alice', email: 'a@b.c', avatar_urls: null } as never;
}

function buildMessages(ids: string[]): MessageData[] {
    return ids.map(
        (id) => ({ id, content: `m${id}`, user: { id: 'u1', username: 'alice', avatar_urls: null } }) as MessageData,
    );
}

function seedMessages(ids: string[]): void {
    useChatStore().$patch({ messages: buildMessages(ids) } as never);
}

async function seedDmMessages(ids: string[]): Promise<void> {
    const { useDirectMessagesStore } = await import('@/stores/directMessages');
    useDirectMessagesStore().$patch({ messages: buildMessages(ids) } as never);
}

beforeEach(() => {
    routerPush.mockReset();
    apiSendMessage.mockReset();
    apiDeleteMessage.mockReset();
    apiEditMessage.mockReset();
    jumpToBottom.mockReset();
    seedUser();
});

describe('MessagesPanel rendering branches', () => {
    it('shows the skeleton while loading with no messages', () => {
        const chat = useChatStore();
        chat.$patch({ isLoadingMessages: true, messages: [] } as never);
        const wrapper = mountPanel();
        expect(wrapper.find('.skeleton').exists()).toBe(true);
    });

    it('shows the empty state when there are no messages', () => {
        const wrapper = mountPanel();
        expect(wrapper.find('.skeleton').exists()).toBe(false);
        expect(wrapper.text()).toContain('general');
    });

    it('renders one Message per store message', () => {
        seedMessages(['1', '2', '3']);
        const wrapper = mountPanel();
        expect(wrapper.findAll('.message')).toHaveLength(3);
    });

    it('shows the channel name and topic in the header', () => {
        const wrapper = mountPanel();
        expect(wrapper.text()).toContain('general');
        expect(wrapper.text()).toContain('a topic');
    });
});

describe('MessagesPanel header actions', () => {
    it('emits toggleUsersCollapsed when the members button is clicked (channel mode)', async () => {
        const wrapper = mountPanel({ isDm: false });
        // Last header button toggles the members panel.
        const buttons = wrapper.findAll('.border-b button');
        await buttons[buttons.length - 1].trigger('click');
        expect(wrapper.emitted('toggleUsersCollapsed')).toBeTruthy();
    });

    it('hides the members toggle in DM mode', () => {
        const wrapper = mountPanel({ isDm: true, channel: { id: '10', name: 'bob' } });
        expect(wrapper.text()).not.toContain('Hide');
    });
});

describe('MessagesPanel pill', () => {
    it('jumps to bottom when the new-message pill is clicked', async () => {
        seedMessages(['1']);
        const chat = useChatStore();
        // isViewingHistory => hasMoreAfter true makes the pill show.
        chat.$patch({ hasMoreAfter: true } as never);
        const wrapper = mountPanel();
        const pill = wrapper.find('.pill');
        expect(pill.exists()).toBe(true);
        await pill.trigger('click');
        expect(jumpToBottom).toHaveBeenCalled();
    });
});

describe('MessagesPanel message actions', () => {
    it('opens the delete dialog and deletes via the channel api', async () => {
        apiDeleteMessage.mockResolvedValue({});
        seedMessages(['1']);
        const wrapper = mountPanel();
        await wrapper.find('.delete-btn').trigger('click');
        await nextTick();
        // Confirm button is the destructive one in the dialog footer (teleported).
        const confirm = document.body.querySelector('button.bg-destructive, [variant="destructive"]');
        // Fallback: find by text in the document.
        const buttons = Array.from(document.body.querySelectorAll('button'));
        const target = confirm ?? buttons.find((b) => /delete/i.test(b.textContent ?? ''));
        (target as HTMLButtonElement | null)?.click();
        await flushPromises();
        expect(apiDeleteMessage).toHaveBeenCalledWith('10', '1');
    });

    it('opens a thread on the thread store when a message requests it (channel mode)', async () => {
        const { useThreadStore } = await import('@/stores/thread');
        seedMessages(['1']);
        const wrapper = mountPanel({ isDm: false });
        const threadStore = useThreadStore();
        const spy = vi.spyOn(threadStore, 'openThread');
        await wrapper.find('.thread-btn').trigger('click');
        expect(spy).toHaveBeenCalled();
    });

    it('does not open a thread in DM mode', async () => {
        const { useThreadStore } = await import('@/stores/thread');
        await seedDmMessages(['1']);
        const wrapper = mountPanel({ isDm: true, channel: { id: '10', name: 'bob' } });
        const threadStore = useThreadStore();
        const spy = vi.spyOn(threadStore, 'openThread');
        await wrapper.find('.thread-btn').trigger('click');
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('MessagesPanel send wiring', () => {
    it('sends a message through the channel api and appends an optimistic message', async () => {
        apiSendMessage.mockResolvedValue({ data: null });
        const wrapper = mountPanel();
        const chat = useChatStore();
        await wrapper.findComponent({ name: 'MessageInput' }).vm.$emit('send', 'hello', []);
        await flushPromises();
        expect(apiSendMessage).toHaveBeenCalledTimes(1);
        expect(apiSendMessage.mock.calls[0][0]).toBe('10');
        // Optimistic message was appended to the store.
        expect(chat.messages.some((m) => m.content === 'hello')).toBe(true);
    });

    it('does nothing when there is no channel', async () => {
        const wrapper = mountPanel({ channel: undefined });
        await wrapper.findComponent({ name: 'MessageInput' }).vm.$emit('send', 'hello', []);
        await flushPromises();
        expect(apiSendMessage).not.toHaveBeenCalled();
    });

    it('sends a client_temp_id and reconciles the optimistic copy to a single server message', async () => {
        const server = {
            id: 'server-1',
            content: 'hello',
            user: { id: 'u1', username: 'alice', avatar_urls: null },
            reactions: [],
            created_at: '2026-01-01T00:00:00Z',
        } as unknown as MessageData;
        vi.mocked(normalizeMessage).mockReturnValue(server);
        apiSendMessage.mockResolvedValue({ data: { id: 'server-1' }, included: [] });

        const wrapper = mountPanel();
        const chat = useChatStore();
        await wrapper.findComponent({ name: 'MessageInput' }).vm.$emit('send', 'hello', []);
        await flushPromises();

        // The linking id was sent to the server...
        expect(apiSendMessage.mock.calls[0][1]).toEqual(
            expect.objectContaining({ client_temp_id: expect.any(String) }),
        );
        // ...and the optimistic entry became the server copy — exactly one 'hello'.
        const hellos = chat.messages.filter((m) => m.content === 'hello');
        expect(hellos).toHaveLength(1);
        expect(hellos[0].id).toBe('server-1');
    });

    it('drops the optimistic copy when the broadcast delivered the server message first', async () => {
        const server = {
            id: 'server-1',
            content: 'hello',
            user: { id: 'u1', username: 'alice', avatar_urls: null },
            reactions: [],
            created_at: '2026-01-01T00:00:00Z',
        } as unknown as MessageData;
        vi.mocked(normalizeMessage).mockReturnValue(server);
        apiSendMessage.mockResolvedValue({ data: { id: 'server-1' }, included: [] });

        // Simulate the own broadcast racing ahead: the server copy is already present.
        seedMessages(['server-1']);

        const wrapper = mountPanel();
        const chat = useChatStore();
        await wrapper.findComponent({ name: 'MessageInput' }).vm.$emit('send', 'hello', []);
        await flushPromises();

        // No duplicate: the optimistic entry was removed, leaving one server-1.
        expect(chat.messages.filter((m) => m.id === 'server-1')).toHaveLength(1);
        expect(chat.messages).toHaveLength(1);
    });
});
