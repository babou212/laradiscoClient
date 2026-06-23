import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { useUsersStore } from '@/stores/users';
import type { MessageData } from '@/types/chat';
import PinnedMessagesPanel from './PinnedMessagesPanel.vue';

const stubs = {
    Avatar: { template: '<div class="avatar"><slot /></div>' },
    AvatarImage: { template: '<img />' },
    AvatarFallback: { template: '<div class="avatar-fallback"><slot /></div>' },
    Skeleton: { template: '<div class="skeleton" />' },
    SimpleTooltip: { template: '<div><slot /></div>' },
};

function message(overrides: Partial<MessageData> = {}): MessageData {
    return {
        id: '1',
        content: 'Hello world',
        is_edited: false,
        edited_at: null,
        deleted_at: null,
        reply_to_id: null,
        user: { id: '7', username: 'alice', avatar_urls: null },
        reactions: [],
        created_at: '2026-06-23T10:00:00Z',
        ...overrides,
    } as MessageData;
}

function mountPanel(props: Partial<{ pinnedMessages: MessageData[]; isLoading: boolean; canUnpin: boolean }> = {}) {
    return mount(PinnedMessagesPanel, {
        props: {
            pinnedMessages: props.pinnedMessages ?? [],
            isLoading: props.isLoading ?? false,
            canUnpin: props.canUnpin,
        },
        global: { stubs },
    });
}

describe('PinnedMessagesPanel rendering', () => {
    it('shows the panel title', () => {
        expect(mountPanel().text()).toContain('Pinned Messages');
    });

    it('renders the empty state when there are no pinned messages', () => {
        expect(mountPanel({ pinnedMessages: [] }).text()).toContain('No pinned messages yet.');
    });

    it('renders skeletons while loading and no empty state', () => {
        const wrapper = mountPanel({ isLoading: true });
        expect(wrapper.findAll('.skeleton').length).toBeGreaterThan(0);
        expect(wrapper.text()).not.toContain('No pinned messages yet.');
    });

    it('renders pinned messages with author name and content', () => {
        useUsersStore().upsert({ id: '7', username: 'alice', display_name: 'Alice' });
        const wrapper = mountPanel({ pinnedMessages: [message({ content: 'Pinned note' })] });
        expect(wrapper.text()).toContain('Alice');
        expect(wrapper.html()).toContain('Pinned note');
        expect(wrapper.text()).not.toContain('No pinned messages yet.');
    });

    it('renders one row per pinned message', () => {
        const messages = [message({ id: '1', content: 'first' }), message({ id: '2', content: 'second' })];
        const wrapper = mountPanel({ pinnedMessages: messages });
        expect(wrapper.html()).toContain('first');
        expect(wrapper.html()).toContain('second');
    });
});

describe('PinnedMessagesPanel unpin button', () => {
    it('hides the unpin button when canUnpin is false', () => {
        const wrapper = mountPanel({ pinnedMessages: [message()], canUnpin: false });
        expect(wrapper.find('.lucide-pin-off-icon').exists()).toBe(false);
    });

    it('shows the unpin button when canUnpin is true', () => {
        const wrapper = mountPanel({ pinnedMessages: [message()], canUnpin: true });
        expect(wrapper.find('.lucide-pin-off-icon').exists()).toBe(true);
    });
});

describe('PinnedMessagesPanel emits', () => {
    it('emits close when the close button is clicked', async () => {
        const wrapper = mountPanel();
        // The header close button is the only button when there are no messages.
        await wrapper.get('button').trigger('click');
        expect(wrapper.emitted('close')).toBeTruthy();
    });

    it('emits jump with the message id when a message row is clicked', async () => {
        const wrapper = mountPanel({ pinnedMessages: [message({ id: '42' })] });
        await wrapper.find('[class*="cursor-pointer"]').trigger('click');
        expect(wrapper.emitted('jump')?.[0]).toEqual(['42']);
    });

    it('emits unpin with the message id and does not also jump', async () => {
        const wrapper = mountPanel({ pinnedMessages: [message({ id: '42' })], canUnpin: true });
        await wrapper.find('.lucide-pin-off-icon').trigger('click');
        expect(wrapper.emitted('unpin')?.[0]).toEqual(['42']);
        expect(wrapper.emitted('jump')).toBeFalsy();
    });
});
