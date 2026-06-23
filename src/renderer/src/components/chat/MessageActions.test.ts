import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MessageActions from './MessageActions.vue';

const stubs = {
    EmojiPicker: true,
    SimpleTooltip: { template: '<div><slot /></div>' },
};

const allFalse = {
    canReact: false,
    canReply: false,
    canThread: false,
    canPin: false,
    canEdit: false,
    canDelete: false,
    isPinned: false,
    showEmojiPicker: false,
    emojiPickerPosition: 'below' as const,
};

function mountActions(overrides: Partial<typeof allFalse> = {}) {
    return mount(MessageActions, { props: { ...allFalse, ...overrides }, global: { stubs } });
}

describe('MessageActions visibility', () => {
    it('renders no action buttons when all permissions are false', () => {
        expect(mountActions().findAll('button')).toHaveLength(0);
    });

    it('shows only the permitted actions', () => {
        const wrapper = mountActions({ canReply: true, canDelete: true });
        expect(wrapper.findAll('button')).toHaveLength(2);
    });
});

describe('MessageActions emits', () => {
    it('emits reply when the reply button is clicked', async () => {
        const wrapper = mountActions({ canReply: true });
        await wrapper.get('button').trigger('click');
        expect(wrapper.emitted('reply')).toBeTruthy();
    });

    it('emits delete when the delete button is clicked', async () => {
        const wrapper = mountActions({ canDelete: true });
        await wrapper.get('button').trigger('click');
        expect(wrapper.emitted('delete')).toBeTruthy();
    });

    it('emits toggleEmojiPicker from the reaction button', async () => {
        const wrapper = mountActions({ canReact: true });
        await wrapper.get('[data-reaction-button]').trigger('click');
        expect(wrapper.emitted('toggleEmojiPicker')).toBeTruthy();
    });

    it('emits togglePin and reflects pinned state via the icon swap', async () => {
        const wrapper = mountActions({ canPin: true, isPinned: true });
        await wrapper.get('button').trigger('click');
        expect(wrapper.emitted('togglePin')).toBeTruthy();
    });
});
