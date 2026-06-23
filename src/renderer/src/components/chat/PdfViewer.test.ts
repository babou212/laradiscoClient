import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Attachment } from '@/types/chat';
import PdfViewer from './PdfViewer.vue';

const getAttachmentDownloadUrl = vi.fn();
vi.mock('@/api/attachments', () => ({
    getAttachmentDownloadUrl: (...a: unknown[]) => getAttachmentDownloadUrl(...a),
}));

const stubs = {
    SimpleTooltip: { template: '<div><slot /></div>' },
};

function attachment(overrides: Partial<Attachment> = {}): Attachment {
    return {
        id: 'pdf1',
        file_name: 'report.pdf',
        mime_type: 'application/pdf',
        size: 3 * 1024 * 1024,
        has_thumbnail: false,
        width: null,
        height: null,
        ...overrides,
    } as Attachment;
}

function mountViewer(att: Attachment = attachment()) {
    return mount(PdfViewer, { props: { attachment: att }, global: { stubs } });
}

beforeEach(() => {
    getAttachmentDownloadUrl.mockReset().mockResolvedValue({ download_url: 'https://cdn/report.pdf' });
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('PdfViewer trigger', () => {
    it('shows the file name and formatted size', () => {
        const wrapper = mountViewer(attachment({ size: 2048 }));
        expect(wrapper.text()).toContain('report.pdf');
        expect(wrapper.text()).toContain('2.0 KB');
    });

    it('does not render the lightbox until opened', () => {
        mountViewer();
        expect(document.body.querySelector('iframe')).toBeNull();
    });
});

describe('PdfViewer lightbox', () => {
    it('opens the lightbox, resolves the URL and renders the iframe', async () => {
        const wrapper = mountViewer();
        await wrapper.get('button').trigger('click');
        await flushPromises();

        expect(getAttachmentDownloadUrl).toHaveBeenCalledWith('pdf1');
        const iframe = document.body.querySelector('iframe');
        expect(iframe).not.toBeNull();
        expect(iframe?.getAttribute('src')).toBe('https://cdn/report.pdf');
    });

    it('reuses the cached URL on the second open (no re-fetch)', async () => {
        const wrapper = mountViewer();
        await wrapper.get('button').trigger('click');
        await flushPromises();
        // Close via Escape.
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await flushPromises();
        expect(document.body.querySelector('iframe')).toBeNull();

        await wrapper.get('button').trigger('click');
        await flushPromises();
        expect(getAttachmentDownloadUrl).toHaveBeenCalledTimes(1);
        expect(document.body.querySelector('iframe')).not.toBeNull();
    });

    it('closes the lightbox on Escape', async () => {
        const wrapper = mountViewer();
        await wrapper.get('button').trigger('click');
        await flushPromises();
        expect(document.body.querySelector('iframe')).not.toBeNull();

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        await flushPromises();
        expect(document.body.querySelector('iframe')).toBeNull();
    });

    it('does not close on a non-Escape key', async () => {
        const wrapper = mountViewer();
        await wrapper.get('button').trigger('click');
        await flushPromises();

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await flushPromises();
        expect(document.body.querySelector('iframe')).not.toBeNull();
    });

    it('closes the lightbox if URL resolution fails', async () => {
        getAttachmentDownloadUrl.mockRejectedValueOnce(new Error('boom'));
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const wrapper = mountViewer();
        await wrapper.get('button').trigger('click');
        await flushPromises();

        expect(document.body.querySelector('iframe')).toBeNull();
        errSpy.mockRestore();
    });
});

describe('PdfViewer download', () => {
    it('resolves the URL and triggers an anchor click', async () => {
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        const wrapper = mountViewer();
        // Open first so the download button (inside the lightbox) renders.
        await wrapper.get('button').trigger('click');
        await flushPromises();

        const buttons = document.body.querySelectorAll('button');
        // The lightbox header has the download button first.
        (buttons[0] as HTMLButtonElement).click();
        await flushPromises();

        expect(getAttachmentDownloadUrl).toHaveBeenCalled();
        expect(click).toHaveBeenCalled();
        click.mockRestore();
    });
});
