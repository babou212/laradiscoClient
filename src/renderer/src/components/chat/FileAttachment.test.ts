import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Attachment } from '@/types/chat';
import FileAttachment from './FileAttachment.vue';

const getAttachmentDownloadUrl = vi.fn();
vi.mock('@/api/attachments', () => ({
    getAttachmentDownloadUrl: (...a: unknown[]) => getAttachmentDownloadUrl(...a),
}));

const stubs = {
    AudioPlayer: { template: '<div data-stub="audio" />' },
    VideoPlayer: { template: '<div data-stub="video" />' },
    PdfViewer: { template: '<div data-stub="pdf" />' },
    SimpleTooltip: { template: '<div><slot /></div>' },
};

function attachment(overrides: Partial<Attachment> = {}): Attachment {
    return {
        id: 'a1',
        file_name: 'document.zip',
        mime_type: 'application/zip',
        size: 2048,
        has_thumbnail: false,
        width: null,
        height: null,
        ...overrides,
    } as Attachment;
}

function mountFile(att: Attachment) {
    return mount(FileAttachment, { props: { attachment: att }, global: { stubs } });
}

beforeEach(() => {
    getAttachmentDownloadUrl.mockReset().mockResolvedValue({ download_url: 'https://cdn/x.zip' });
});

describe('FileAttachment type routing', () => {
    it('renders AudioPlayer for audio attachments', () => {
        const wrapper = mountFile(attachment({ mime_type: 'audio/mpeg' }));
        expect(wrapper.find('[data-stub="audio"]').exists()).toBe(true);
    });

    it('renders VideoPlayer for video attachments', () => {
        const wrapper = mountFile(attachment({ mime_type: 'video/mp4' }));
        expect(wrapper.find('[data-stub="video"]').exists()).toBe(true);
    });

    it('renders PdfViewer for pdf attachments', () => {
        const wrapper = mountFile(attachment({ mime_type: 'application/pdf' }));
        expect(wrapper.find('[data-stub="pdf"]').exists()).toBe(true);
    });

    it('renders a download button for a generic file', () => {
        const wrapper = mountFile(attachment());
        expect(wrapper.text()).toContain('document.zip');
    });
});

describe('FileAttachment size formatting', () => {
    it('formats bytes/KB/MB in the label', () => {
        expect(mountFile(attachment({ size: 512 })).text()).toContain('512 B');
        expect(mountFile(attachment({ size: 2048 })).text()).toContain('2.0 KB');
        expect(mountFile(attachment({ size: 5 * 1024 * 1024 })).text()).toContain('5.0 MB');
    });
});

describe('FileAttachment download', () => {
    it('resolves the download URL and triggers an anchor click', async () => {
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        const wrapper = mountFile(attachment());
        await wrapper.get('button').trigger('click');
        await flushPromises();

        expect(getAttachmentDownloadUrl).toHaveBeenCalledWith('a1');
        expect(click).toHaveBeenCalled();
        click.mockRestore();
    });
});
