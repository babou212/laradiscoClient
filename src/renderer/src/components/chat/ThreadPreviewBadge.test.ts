import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { ThreadPreview } from '@/types/chat';
import ThreadPreviewBadge from './ThreadPreviewBadge.vue';

function thread(overrides: Partial<ThreadPreview> = {}): ThreadPreview {
    return {
        id: 't1',
        message_count: 3,
        last_message_at: '2026-06-23T10:00:00Z',
        is_following: false,
        last_reply: null,
        ...overrides,
    } as ThreadPreview;
}

describe('ThreadPreviewBadge', () => {
    it('pluralizes the reply count', () => {
        expect(mount(ThreadPreviewBadge, { props: { thread: thread({ message_count: 1 }) } }).text()).toContain(
            '1 reply',
        );
        expect(mount(ThreadPreviewBadge, { props: { thread: thread({ message_count: 4 }) } }).text()).toContain(
            '4 replies',
        );
    });

    it('shows a last-reply timestamp label when present', () => {
        const wrapper = mount(ThreadPreviewBadge, { props: { thread: thread() } });
        expect(wrapper.text()).toContain('Last reply');
    });

    it('emits openThread when clicked', async () => {
        const wrapper = mount(ThreadPreviewBadge, { props: { thread: thread() } });
        await wrapper.get('button').trigger('click');
        expect(wrapper.emitted('openThread')).toBeTruthy();
    });

    it('does not render an avatar when there is no last reply', () => {
        const wrapper = mount(ThreadPreviewBadge, { props: { thread: thread({ last_reply: null }) } });
        expect(wrapper.find('img').exists()).toBe(false);
    });
});
