import { flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Attachment } from '@/types/chat';
import VideoPlayer from './VideoPlayer.vue';

const getAttachmentDownloadUrl = vi.fn();
vi.mock('@/api/attachments', () => ({
    getAttachmentDownloadUrl: (...a: unknown[]) => getAttachmentDownloadUrl(...a),
}));

const stubs = {
    SimpleTooltip: { template: '<div><slot /></div>' },
    Slider: {
        name: 'Slider',
        props: ['modelValue', 'min', 'max', 'step'],
        emits: ['update:modelValue', 'value-commit', 'pointerdown'],
        template: '<div data-stub="slider" />',
    },
};

function attachment(overrides: Partial<Attachment> = {}): Attachment {
    return {
        id: 'vid1',
        file_name: 'clip.mp4',
        mime_type: 'video/mp4',
        size: 5 * 1024 * 1024,
        has_thumbnail: false,
        width: null,
        height: null,
        ...overrides,
    } as Attachment;
}

function mountPlayer(att: Attachment = attachment()) {
    return mount(VideoPlayer, { props: { attachment: att }, global: { stubs } });
}

// The big poster play button starts video loading.
function posterButton(wrapper: VueWrapper) {
    return wrapper.findAll('button').find((b) => b.element.className.includes('inset-0'))!;
}

beforeEach(() => {
    getAttachmentDownloadUrl.mockReset().mockResolvedValue({
        download_url: 'https://cdn/clip.mp4',
        thumbnail_url: 'https://cdn/clip-thumb.jpg',
    });
    window.api.attachments.prepareVideo = vi
        .fn()
        .mockResolvedValue({ data: new Uint8Array([1, 2, 3]), mimeType: 'video/mp4' });
    window.api.attachments.cleanupVideo = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1 as unknown as number);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('VideoPlayer rendering', () => {
    it('shows the file name and formatted size in the caption', () => {
        const wrapper = mountPlayer(attachment({ size: 2048 }));
        expect(wrapper.text()).toContain('clip.mp4');
        expect(wrapper.text()).toContain('2.0 KB');
    });

    it('uses the attachment aspect ratio when dimensions are present', () => {
        const wrapper = mountPlayer(attachment({ width: 1920, height: 1080 }));
        const player = wrapper.find('.group');
        expect(player.attributes('style')).toContain('aspect-ratio: 1920/1080');
    });

    it('falls back to a fixed height when no dimensions are present', () => {
        const wrapper = mountPlayer(attachment({ width: null, height: null }));
        const player = wrapper.find('.group');
        expect(player.attributes('style')).toContain('height: 180px');
    });

    it('renders a poster placeholder before any source is loaded', () => {
        const wrapper = mountPlayer();
        expect(wrapper.find('video').exists()).toBe(false);
        expect(posterButton(wrapper).exists()).toBe(true);
    });
});

describe('VideoPlayer thumbnail', () => {
    it('loads and displays the thumbnail when has_thumbnail is set', async () => {
        const wrapper = mountPlayer(attachment({ has_thumbnail: true }));
        await flushPromises();
        const img = wrapper.find('img');
        expect(img.exists()).toBe(true);
        expect(img.attributes('src')).toBe('https://cdn/clip-thumb.jpg');
    });

    it('clears the thumbnail on image error', async () => {
        const wrapper = mountPlayer(attachment({ has_thumbnail: true }));
        await flushPromises();
        await wrapper.find('img').trigger('error');
        expect(wrapper.find('img').exists()).toBe(false);
    });
});

describe('VideoPlayer load and play', () => {
    it('prepares the video and creates a blob src on poster click', async () => {
        const wrapper = mountPlayer();
        await posterButton(wrapper).trigger('click');
        await flushPromises();

        expect(getAttachmentDownloadUrl).toHaveBeenCalledWith('vid1');
        expect(window.api.attachments.prepareVideo).toHaveBeenCalledWith({
            attachmentId: 'vid1',
            downloadUrl: 'https://cdn/clip.mp4',
            mimeType: 'video/mp4',
        });
        const video = wrapper.find('video');
        expect(video.exists()).toBe(true);
        expect(video.attributes('src')).toMatch(/^blob:/);
    });

    it('reads duration and clears buffering when the video can play', async () => {
        const wrapper = mountPlayer();
        await posterButton(wrapper).trigger('click');
        await flushPromises();

        const video = wrapper.find('video');
        Object.defineProperty(video.element, 'duration', { value: 95, configurable: true });
        await video.trigger('canplay');
        await flushPromises();
        // 95s -> 1:35.
        expect(wrapper.text()).toContain('/ 1:35');
    });

    it('shows the error UI when preparation fails', async () => {
        window.api.attachments.prepareVideo = vi.fn().mockRejectedValue(new Error('boom'));
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const wrapper = mountPlayer();
        await posterButton(wrapper).trigger('click');
        await flushPromises();
        expect(wrapper.text()).toContain('Failed to load video');
        errSpy.mockRestore();
    });
});

describe('VideoPlayer playback state', () => {
    async function loadAndCanPlay(wrapper: VueWrapper) {
        await posterButton(wrapper).trigger('click');
        await flushPromises();
        const video = wrapper.find('video');
        Object.defineProperty(video.element, 'duration', { value: 60, configurable: true });
        await video.trigger('canplay');
        await flushPromises();
        return video;
    }

    it('tracks playing state via the play and pause media events', async () => {
        const wrapper = mountPlayer();
        const video = await loadAndCanPlay(wrapper);

        await video.trigger('play');
        expect(wrapper.html()).toContain('lucide-pause');

        await video.trigger('pause');
        expect(wrapper.html()).toContain('lucide-play');
    });

    it('resets currentTime to 0 when playback ends', async () => {
        const wrapper = mountPlayer();
        const video = await loadAndCanPlay(wrapper);
        await video.trigger('play');
        await video.trigger('ended');
        expect(wrapper.text()).toContain('0:00 / 1:00');
    });
});

describe('VideoPlayer seek, volume and speed math', () => {
    async function ready(wrapper: VueWrapper) {
        await posterButton(wrapper).trigger('click');
        await flushPromises();
        const video = wrapper.find('video');
        Object.defineProperty(video.element, 'duration', { value: 200, configurable: true });
        await video.trigger('canplay');
        await flushPromises();
        return video;
    }

    it('converts a seek commit percentage into a media currentTime', async () => {
        const wrapper = mountPlayer();
        const video = await ready(wrapper);
        const seekSlider = wrapper.findAllComponents({ name: 'Slider' })[0];
        seekSlider.vm.$emit('value-commit', [25]); // 25% of 200s -> 50s
        await flushPromises();
        expect(video.element.currentTime).toBe(50);
    });

    it('updates the media volume when the volume slider changes', async () => {
        const wrapper = mountPlayer();
        const video = await ready(wrapper);
        const volumeSlider = wrapper.findAllComponents({ name: 'Slider' })[1];
        volumeSlider.vm.$emit('update:modelValue', [30]); // 0.3
        await flushPromises();
        expect(video.element.volume).toBeCloseTo(0.3);
    });

    it('opens the speed menu and applies the chosen playback rate', async () => {
        const wrapper = mountPlayer();
        const video = await ready(wrapper);

        const speedToggle = wrapper.findAll('button').find((b) => b.text().includes('1x'))!;
        await speedToggle.trigger('click');

        const speedOption = wrapper.findAll('button').find((b) => b.text().trim() === '1.5x')!;
        await speedOption.trigger('click');
        expect(video.element.playbackRate).toBe(1.5);
        expect(wrapper.text()).toContain('1.5x');
    });
});

describe('VideoPlayer download', () => {
    it('resolves the URL and triggers an anchor click', async () => {
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        const wrapper = mountPlayer();
        // Download lives in the controls bar, which only renders once a source exists.
        await posterButton(wrapper).trigger('click');
        await flushPromises();
        const video = wrapper.find('video');
        Object.defineProperty(video.element, 'duration', { value: 10, configurable: true });
        await video.trigger('canplay');
        await flushPromises();

        const downloadBtn = wrapper.findAll('button').find((b) => b.html().includes('lucide-download'))!;
        await downloadBtn.trigger('click');
        await flushPromises();
        expect(click).toHaveBeenCalled();
        click.mockRestore();
    });
});
