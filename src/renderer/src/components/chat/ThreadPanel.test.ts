import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useThreadStore } from '@/stores/thread';
import type { MessageData, ThreadPreview } from '@/types/chat';
import ThreadPanel from './ThreadPanel.vue';

vi.mock('@/lib/echo', async () => (await import('@/../../../test/helpers/echo')).echoMockFactory());
vi.mock('@/api/typing', () => ({ sendThreadTyping: vi.fn(() => Promise.resolve()) }));
vi.mock('@/api/normalizers', () => ({ coerceBroadcastMessage: vi.fn() }));
vi.mock('@/lib/markdown', () => ({ renderMarkdownWithMentions: (s: string) => `<p>${s}</p>` }));

const jumpToBottom = vi.fn();
vi.mock('@/composables/useChatScroll', async () => {
    const { shallowRef } = await import('vue');
    return {
        useChatScroll: () => ({
            pinnedToBottom: shallowRef(true),
            unreadNewCount: shallowRef(0),
            isLoadingOlder: shallowRef(false),
            isLoadingNewer: shallowRef(false),
            scrollToBottom: vi.fn(),
            jumpToBottom,
            notifyNewMessage: vi.fn(),
            resetForNewConversation: vi.fn(),
        }),
    };
});

const MessageStub = {
    props: ['message'],
    emits: ['start-edit', 'cancel-edit', 'save-edit', 'delete', 'toggle-reaction'],
    template: `<div class="message" :data-id="message.id">
        <button class="delete-btn" @click="$emit('delete')">delete</button>
    </div>`,
};

const stubs = {
    Message: MessageStub,
    MessageInput: {
        name: 'MessageInput',
        template: '<div class="message-input" />',
        emits: ['send', 'typing', 'cancel-reply'],
    },
    NewMessagePill: { template: '<button class="pill" @click="$emit(\'click\')" />' },
    FileAttachment: true,
    TypingIndicator: true,
    SimpleTooltip: { template: '<div><slot /></div>' },
    Avatar: { template: '<div><slot /></div>' },
    AvatarImage: true,
    AvatarFallback: { template: '<div><slot /></div>' },
};

function makeParent(id = 'p1'): MessageData {
    return {
        id,
        content: 'parent body',
        user: { id: 'u2', username: 'bob', avatar_urls: null },
        created_at: '2026-01-01T00:00:00Z',
    } as MessageData;
}

function makeThread(attrs: Partial<ThreadPreview> = {}): ThreadPreview {
    return {
        id: 't1',
        message_count: 2,
        last_message_at: '2026-01-02T00:00:00Z',
        is_following: false,
        ...attrs,
    } as ThreadPreview;
}

function seedUser(): void {
    const auth = useAuthStore();
    auth.user = { id: 'u1', username: 'alice', email: 'a@b.c', avatar_urls: null } as never;
}

function mountPanel(props: Record<string, unknown> = {}) {
    return mount(ThreadPanel, {
        props: { channelId: '10', ...props },
        global: { stubs },
    });
}

beforeEach(() => {
    jumpToBottom.mockReset();
    seedUser();
});

describe('ThreadPanel parent + branches', () => {
    it('renders the parent message author and rendered content', () => {
        const store = useThreadStore();
        store.$patch({ parentMessage: makeParent(), activeThread: makeThread() } as never);
        const wrapper = mountPanel();
        expect(wrapper.text()).toContain('bob');
        expect(wrapper.html()).toContain('parent body');
    });

    it('shows a loading spinner while thread messages load', () => {
        const store = useThreadStore();
        store.$patch({ parentMessage: makeParent(), isLoadingMessages: true } as never);
        const wrapper = mountPanel();
        expect(wrapper.find('.animate-spin').exists()).toBe(true);
        expect(wrapper.findAll('.message')).toHaveLength(0);
    });

    it('shows the empty "no replies" state when there are no thread messages', () => {
        const store = useThreadStore();
        store.$patch({ parentMessage: makeParent(), threadMessages: [] } as never);
        const wrapper = mountPanel();
        expect(wrapper.text()).toContain('No replies');
    });

    it('renders one Message per thread reply', () => {
        const store = useThreadStore();
        store.$patch({
            parentMessage: makeParent(),
            activeThread: makeThread(),
            threadMessages: [
                { id: 'r1', content: 'a', user: { id: 'u1', username: 'alice' }, created_at: '2026-01-01T00:00:00Z' },
                { id: 'r2', content: 'b', user: { id: 'u2', username: 'bob' }, created_at: '2026-01-01T00:00:00Z' },
            ],
        } as never);
        const wrapper = mountPanel();
        expect(wrapper.findAll('.message')).toHaveLength(2);
    });
});

describe('ThreadPanel header actions', () => {
    it('emits close when the X button is clicked', async () => {
        const store = useThreadStore();
        store.$patch({ parentMessage: makeParent(), activeThread: makeThread() } as never);
        const wrapper = mountPanel();
        const headerButtons = wrapper.findAll('.border-b button');
        await headerButtons[headerButtons.length - 1].trigger('click');
        expect(wrapper.emitted('close')).toBeTruthy();
    });

    it('follows a thread that is not yet followed', async () => {
        const store = useThreadStore();
        store.$patch({ parentMessage: makeParent(), activeThread: makeThread({ is_following: false }) } as never);
        const followSpy = vi.spyOn(store, 'followThread').mockResolvedValue();
        const wrapper = mountPanel();
        const headerButtons = wrapper.findAll('.border-b button');
        // First header button is the follow toggle.
        await headerButtons[0].trigger('click');
        expect(followSpy).toHaveBeenCalledWith('10', 't1');
    });

    it('unfollows a thread that is already followed', async () => {
        const store = useThreadStore();
        store.$patch({ parentMessage: makeParent(), activeThread: makeThread({ is_following: true }) } as never);
        const unfollowSpy = vi.spyOn(store, 'unfollowThread').mockResolvedValue();
        const wrapper = mountPanel();
        const headerButtons = wrapper.findAll('.border-b button');
        await headerButtons[0].trigger('click');
        expect(unfollowSpy).toHaveBeenCalledWith('10', 't1');
    });
});

describe('ThreadPanel reply sending', () => {
    it('optimistically adds a reply then reconciles with the store reply', async () => {
        const store = useThreadStore();
        store.$patch({ parentMessage: makeParent(), activeThread: makeThread() } as never);
        const serverReply = {
            id: 'server1',
            content: 'hi there',
            user: { id: 'u1', username: 'alice' },
            created_at: '2026-01-03T00:00:00Z',
        } as MessageData;
        const spy = vi.spyOn(store, 'sendReply').mockResolvedValue(serverReply);
        const wrapper = mountPanel();

        await wrapper.findComponent({ name: 'MessageInput' }).vm.$emit('send', 'hi there');
        await flushPromises();

        expect(spy).toHaveBeenCalled();
        expect(spy.mock.calls[0][0]).toBe('10');
        expect(store.threadMessages.some((m) => m.id === 'server1')).toBe(true);
    });

    it('surfaces an error and removes the optimistic message when send fails', async () => {
        const store = useThreadStore();
        store.$patch({ parentMessage: makeParent(), activeThread: makeThread() } as never);
        vi.spyOn(store, 'sendReply').mockResolvedValue(null);
        const wrapper = mountPanel();

        await wrapper.findComponent({ name: 'MessageInput' }).vm.$emit('send', 'oops');
        await flushPromises();

        expect(store.threadMessages).toHaveLength(0);
        expect(wrapper.text()).toContain('Failed');
    });

    it('does nothing when there is no parent message', async () => {
        const store = useThreadStore();
        const spy = vi.spyOn(store, 'sendReply');
        const wrapper = mountPanel();
        await wrapper.findComponent({ name: 'MessageInput' }).vm.$emit('send', 'x');
        await flushPromises();
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('ThreadPanel delete', () => {
    it('opens the delete dialog and deletes through the store', async () => {
        const store = useThreadStore();
        store.$patch({
            parentMessage: makeParent(),
            activeThread: makeThread(),
            threadMessages: [
                { id: 'r1', content: 'a', user: { id: 'u1', username: 'alice' }, created_at: '2026-01-01T00:00:00Z' },
            ],
        } as never);
        const spy = vi.spyOn(store, 'deleteMessage').mockResolvedValue();
        const wrapper = mountPanel();

        await wrapper.find('.delete-btn').trigger('click');
        await nextTick();

        const buttons = Array.from(document.body.querySelectorAll('button'));
        const confirm = buttons.find((b) => /delete/i.test(b.textContent ?? '') && b.className.includes('destructive'));
        const target = confirm ?? buttons.find((b) => /delete/i.test(b.textContent ?? ''));
        (target as HTMLButtonElement | undefined)?.click();
        await flushPromises();

        expect(spy).toHaveBeenCalledWith('10', 't1', 'r1');
    });
});
