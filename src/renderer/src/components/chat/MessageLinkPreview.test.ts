import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkPreviewData } from '@/types/chat';
import MessageLinkPreview from './MessageLinkPreview.vue';

const getAttachmentDownloadUrl = vi.fn();
vi.mock('@/api/attachments', () => ({
    getAttachmentDownloadUrl: (...a: unknown[]) => getAttachmentDownloadUrl(...a),
}));

function preview(overrides: Partial<LinkPreviewData> = {}): LinkPreviewData {
    return {
        url: 'https://example.com/article',
        title: 'An Example Article',
        fetched_at: 0,
        ...overrides,
    };
}

beforeEach(() => {
    getAttachmentDownloadUrl.mockReset().mockResolvedValue({ download_url: 'https://cdn.test/img.png' });
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('MessageLinkPreview metadata', () => {
    it('renders the title and a hostname-derived site name (stripping www.)', () => {
        const wrapper = mount(MessageLinkPreview, {
            props: { linkPreview: preview({ url: 'https://www.example.com/x' }) },
        });
        expect(wrapper.text()).toContain('An Example Article');
        expect(wrapper.text()).toContain('example.com');
    });

    it('prefers an explicit site_name over the hostname', () => {
        const wrapper = mount(MessageLinkPreview, {
            props: { linkPreview: preview({ site_name: 'Example News' }) },
        });
        expect(wrapper.text()).toContain('Example News');
    });

    it('renders the description when provided', () => {
        const wrapper = mount(MessageLinkPreview, {
            props: { linkPreview: preview({ description: 'a short blurb' }) },
        });
        expect(wrapper.text()).toContain('a short blurb');
    });
});

describe('MessageLinkPreview image branches', () => {
    it('renders no image area when there is neither an attachment nor an image_url', () => {
        const wrapper = mount(MessageLinkPreview, { props: { linkPreview: preview() } });
        expect(wrapper.find('img').exists()).toBe(false);
    });

    it('uses an https image_url fallback directly', () => {
        const wrapper = mount(MessageLinkPreview, {
            props: { linkPreview: preview({ image_url: 'https://img.test/og.png' }) },
        });
        expect(wrapper.find('img').exists()).toBe(true);
        expect(wrapper.find('img').attributes('src')).toBe('https://img.test/og.png');
    });

    it('rejects a non-https image_url (no image rendered)', () => {
        const wrapper = mount(MessageLinkPreview, {
            props: { linkPreview: preview({ image_url: 'http://insecure.test/og.png' }) },
        });
        expect(wrapper.find('img').exists()).toBe(false);
    });

    it('downloads the attachment image and renders it', async () => {
        const wrapper = mount(MessageLinkPreview, {
            props: {
                linkPreview: preview({
                    image: { id: 'att-1', mime_type: 'image/png', size: 100 },
                }),
            },
        });
        await flushPromises();
        expect(getAttachmentDownloadUrl).toHaveBeenCalledWith('att-1');
        expect(wrapper.find('img').attributes('src')).toBe('https://cdn.test/img.png');
    });

    it('emits image-loaded once the image fires its load event', async () => {
        const wrapper = mount(MessageLinkPreview, {
            props: { linkPreview: preview({ image_url: 'https://img.test/og.png' }) },
        });
        await wrapper.find('img').trigger('load');
        expect(wrapper.emitted('image-loaded')).toBeTruthy();
    });

    it('hides the image and emits image-loaded after an unrecoverable error', async () => {
        const wrapper = mount(MessageLinkPreview, {
            props: { linkPreview: preview({ image_url: 'https://img.test/og.png' }) },
        });
        await wrapper.find('img').trigger('error');
        await flushPromises();
        expect(wrapper.emitted('image-loaded')).toBeTruthy();
        expect(wrapper.find('img').exists()).toBe(false);
    });
});

describe('MessageLinkPreview external open', () => {
    it('opens the url in a new tab when the title is clicked', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
        const wrapper = mount(MessageLinkPreview, { props: { linkPreview: preview() } });
        const titleButton = wrapper.findAll('button').find((b) => b.text().includes('An Example Article'));
        await titleButton!.trigger('click');
        expect(openSpy).toHaveBeenCalledWith('https://example.com/article', '_blank');
    });
});
