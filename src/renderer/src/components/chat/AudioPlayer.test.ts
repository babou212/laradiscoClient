import { flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Attachment } from '@/types/chat';
import AudioPlayer from './AudioPlayer.vue';

const getAttachmentDownloadUrl = vi.fn();
vi.mock('@/api/attachments', () => ({
    getAttachmentDownloadUrl: (...a: unknown[]) => getAttachmentDownloadUrl(...a),
}));

interface HowlOpts {
    format?: string[];
    onplay?: () => void;
    onpause?: () => void;
    onstop?: () => void;
    onend?: () => void;
    onload?: () => void;
    onloaderror?: (id: number, err: unknown) => void;
    onplayerror?: (id: number, err: unknown) => void;
}

interface HowlInstance {
    opts: HowlOpts;
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    seek: ReturnType<typeof vi.fn>;
    volume: ReturnType<typeof vi.fn>;
    mute: ReturnType<typeof vi.fn>;
    duration: ReturnType<typeof vi.fn>;
    unload: ReturnType<typeof vi.fn>;
}

const howlInstances: HowlInstance[] = [];

vi.mock('howler', () => ({
    Howl: vi.fn(function (opts: HowlOpts) {
        const instance: HowlInstance = {
            opts,
            play: vi.fn(),
            pause: vi.fn(),
            seek: vi.fn(() => 0),
            volume: vi.fn(),
            mute: vi.fn(),
            duration: vi.fn(() => 120),
            unload: vi.fn(),
        };
        howlInstances.push(instance);
        return instance;
    }),
}));

const stubs = {
    SimpleTooltip: { template: '<div><slot /></div>' },
    Slider: {
        name: 'Slider',
        props: ['modelValue', 'disabled', 'min', 'max', 'step'],
        emits: ['update:modelValue', 'value-commit', 'pointerdown'],
        template: '<div data-stub="slider" />',
    },
};

function attachment(overrides: Partial<Attachment> = {}): Attachment {
    return {
        id: 'au1',
        file_name: 'song.mp3',
        mime_type: 'audio/mpeg',
        size: 2 * 1024 * 1024,
        has_thumbnail: false,
        width: null,
        height: null,
        ...overrides,
    } as Attachment;
}

function mountPlayer(att: Attachment = attachment()) {
    return mount(AudioPlayer, { props: { attachment: att }, global: { stubs } });
}

function lastHowl(): HowlInstance {
    return howlInstances[howlInstances.length - 1];
}

function playButton(wrapper: VueWrapper) {
    return wrapper.findAll('button').find((b) => b.element.className.includes('rounded-full'))!;
}

function downloadButton(wrapper: VueWrapper) {
    return wrapper.findAll('button').find((b) => b.html().includes('lucide-download'))!;
}

function muteButton(wrapper: VueWrapper) {
    return wrapper
        .findAll('button')
        .find((b) => b.html().includes('lucide-volume') && !b.element.className.includes('rounded-full'))!;
}

async function startPlaying(wrapper: VueWrapper) {
    await playButton(wrapper).trigger('click');
    await flushPromises();
    lastHowl().opts.onplay?.();
    await flushPromises();
}

beforeEach(() => {
    howlInstances.length = 0;
    getAttachmentDownloadUrl.mockReset().mockResolvedValue({ download_url: 'https://cdn/song.mp3' });
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1 as unknown as number);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('AudioPlayer rendering', () => {
    it('shows the file name and formatted size', () => {
        const wrapper = mountPlayer(attachment({ size: 512 }));
        expect(wrapper.text()).toContain('song.mp3');
        expect(wrapper.text()).toContain('512 B');
    });

    it('renders the initial 0:00 / 0:00 time readout', () => {
        const wrapper = mountPlayer();
        expect(wrapper.text()).toContain('0:00 / 0:00');
    });
});

describe('AudioPlayer format derivation', () => {
    it('maps a known mime type to the howler format', async () => {
        const wrapper = mountPlayer(attachment({ mime_type: 'audio/ogg' }));
        await playButton(wrapper).trigger('click');
        await flushPromises();
        expect(lastHowl().opts.format).toEqual(['ogg']);
    });

    it('falls back to stripping the audio/ prefix for unknown mime types', async () => {
        const wrapper = mountPlayer(attachment({ mime_type: 'audio/x-weird' }));
        await playButton(wrapper).trigger('click');
        await flushPromises();
        expect(lastHowl().opts.format).toEqual(['x-weird']);
    });
});

describe('AudioPlayer playback lifecycle', () => {
    it('resolves the URL and creates a Howl on first play', async () => {
        const wrapper = mountPlayer();
        await playButton(wrapper).trigger('click');
        await flushPromises();
        expect(getAttachmentDownloadUrl).toHaveBeenCalledWith('au1');
        expect(howlInstances).toHaveLength(1);
    });

    it('reflects the playing duration once Howl fires onplay', async () => {
        const wrapper = mountPlayer();
        await startPlaying(wrapper);
        // duration() mock returns 120s -> 2:00.
        expect(wrapper.text()).toContain('/ 2:00');
        // The control now shows a pause icon.
        expect(wrapper.html()).toContain('lucide-pause');
    });

    it('pauses an already-playing Howl instead of recreating it', async () => {
        const wrapper = mountPlayer();
        await startPlaying(wrapper);
        await playButton(wrapper).trigger('click');
        expect(lastHowl().pause).toHaveBeenCalled();
        expect(howlInstances).toHaveLength(1);
    });

    it('resets currentTime when playback ends', async () => {
        const wrapper = mountPlayer();
        await startPlaying(wrapper);
        lastHowl().opts.onend?.();
        await flushPromises();
        expect(wrapper.text()).toContain('0:00 / 2:00');
        expect(wrapper.html()).toContain('lucide-play');
    });

    it('marks loadError and shows the error UI on load error', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const wrapper = mountPlayer();
        await playButton(wrapper).trigger('click');
        await flushPromises();
        lastHowl().opts.onloaderror?.(1, 'decode');
        await flushPromises();
        expect(wrapper.text()).toContain('Failed to load audio');
        errSpy.mockRestore();
    });
});

describe('AudioPlayer seek and volume math', () => {
    it('converts a seek commit percentage into seconds', async () => {
        const wrapper = mountPlayer();
        await startPlaying(wrapper); // duration becomes 120
        const seekSlider = wrapper.findAllComponents({ name: 'Slider' })[0];
        seekSlider.vm.$emit('value-commit', [50]); // 50% of 120s -> 60s
        await flushPromises();
        expect(lastHowl().seek).toHaveBeenCalledWith(60);
    });

    it('updates volume on the Howl when the volume slider changes', async () => {
        const wrapper = mountPlayer();
        await startPlaying(wrapper);
        const volumeSlider = wrapper.findAllComponents({ name: 'Slider' })[1];
        volumeSlider.vm.$emit('update:modelValue', [40]); // 0.4
        await flushPromises();
        expect(lastHowl().volume).toHaveBeenCalledWith(0.4);
    });

    it('toggles mute on the Howl', async () => {
        const wrapper = mountPlayer();
        await startPlaying(wrapper);
        await muteButton(wrapper).trigger('click');
        expect(lastHowl().mute).toHaveBeenCalledWith(true);
    });
});

describe('AudioPlayer download', () => {
    it('resolves the URL and triggers an anchor click', async () => {
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        const wrapper = mountPlayer();
        await downloadButton(wrapper).trigger('click');
        await flushPromises();
        expect(getAttachmentDownloadUrl).toHaveBeenCalledWith('au1');
        expect(click).toHaveBeenCalled();
        click.mockRestore();
    });
});
