import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import NewMessagePill from './NewMessagePill.vue';

describe('NewMessagePill', () => {
    it('shows "Jump to present" when viewing history', () => {
        const wrapper = mount(NewMessagePill, { props: { count: 5, viewingHistory: true } });
        expect(wrapper.text()).toContain('Jump to present');
    });

    it('shows "Jump to bottom" when count is zero and not viewing history', () => {
        const wrapper = mount(NewMessagePill, { props: { count: 0 } });
        expect(wrapper.text()).toContain('Jump to bottom');
    });

    it('shows a singular new-message label for count 1', () => {
        const wrapper = mount(NewMessagePill, { props: { count: 1 } });
        expect(wrapper.text()).toContain('1 new message');
    });

    it('shows a pluralized label for count > 1', () => {
        const wrapper = mount(NewMessagePill, { props: { count: 3 } });
        expect(wrapper.text()).toContain('3 new messages');
    });

    it('emits click when pressed', async () => {
        const wrapper = mount(NewMessagePill, { props: { count: 2 } });
        await wrapper.get('button').trigger('click');
        expect(wrapper.emitted('click')).toBeTruthy();
    });
});
