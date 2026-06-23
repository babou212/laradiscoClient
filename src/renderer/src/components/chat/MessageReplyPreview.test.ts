import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import MessageReplyPreview from './MessageReplyPreview.vue';

describe('MessageReplyPreview', () => {
    it('renders the username and a collapsed preview of the content', () => {
        const wrapper = mount(MessageReplyPreview, {
            props: { username: 'alice', content: 'hello   \n  world' },
        });
        expect(wrapper.text()).toContain('alice');
        expect(wrapper.text()).toContain('hello world');
    });

    it('falls back to "See attachment" for empty content', () => {
        const wrapper = mount(MessageReplyPreview, { props: { username: 'bob', content: '' } });
        expect(wrapper.text()).toContain('See attachment');
    });

    it('replaces a URL with the link-preview title', () => {
        const wrapper = mount(MessageReplyPreview, {
            props: {
                username: 'carol',
                content: 'look https://example.com/x',
                linkPreview: { url: 'https://example.com/x', title: 'Cool Page', fetched_at: 1767225600000 },
            },
        });
        expect(wrapper.text()).toContain('Cool Page');
    });
});
