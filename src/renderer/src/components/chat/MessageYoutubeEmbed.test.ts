import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MessageYoutubeEmbed from './MessageYoutubeEmbed.vue';

const props = {
    videoId: 'abc123',
    url: 'https://youtu.be/abc123',
    embedUrl: 'https://www.youtube.com/embed/abc123',
};

afterEach(() => vi.restoreAllMocks());

describe('MessageYoutubeEmbed', () => {
    it('shows the thumbnail (not the iframe) before play', () => {
        const wrapper = mount(MessageYoutubeEmbed, { props });
        expect(wrapper.find('iframe').exists()).toBe(false);
        const img = wrapper.get('img');
        expect(img.attributes('src')).toBe('https://img.youtube.com/vi/abc123/hqdefault.jpg');
    });

    it('renders the iframe with the embed URL after clicking play', async () => {
        const wrapper = mount(MessageYoutubeEmbed, { props });
        await wrapper.get('button').trigger('click');
        const iframe = wrapper.get('iframe');
        expect(iframe.attributes('src')).toBe(props.embedUrl);
    });

    it('opens the original URL externally', async () => {
        const open = vi.spyOn(window, 'open').mockImplementation(() => null);
        const wrapper = mount(MessageYoutubeEmbed, { props });
        // The second button is the "open in browser" action.
        await wrapper.findAll('button')[1].trigger('click');
        expect(open).toHaveBeenCalledWith(props.url, '_blank');
    });
});
