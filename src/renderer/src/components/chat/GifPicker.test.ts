import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenorGif } from '@/types/chat';
import GifPicker from './GifPicker.vue';

function gif(id: string, overrides: Partial<TenorGif['media_formats']> = {}): TenorGif {
    return {
        id,
        content_description: `gif ${id}`,
        media_formats: {
            tinygif: { url: `https://media.tenor.com/${id}-tiny.gif` },
            gif: { url: `https://media.tenor.com/${id}.gif` },
            ...overrides,
        },
    };
}

function mockFetchOnce(results: TenorGif[], next = '') {
    return vi.fn().mockResolvedValue({
        json: async () => ({ results, next }),
    });
}

beforeEach(() => {
    // Default: mount-time featured fetch returns nothing so each test seeds its own.
    vi.stubGlobal('fetch', mockFetchOnce([]));
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('GifPicker fetch lifecycle', () => {
    it('fetches featured GIFs on mount', async () => {
        const fetchMock = mockFetchOnce([gif('1')]);
        vi.stubGlobal('fetch', fetchMock);
        mount(GifPicker);
        await flushPromises();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toContain('/v2/featured');
    });

    it('renders fetched GIFs as selectable buttons', async () => {
        vi.stubGlobal('fetch', mockFetchOnce([gif('1'), gif('2')]));
        const wrapper = mount(GifPicker);
        await flushPromises();
        const imgs = wrapper.findAll('img');
        expect(imgs).toHaveLength(2);
        expect(imgs[0].attributes('src')).toBe('https://media.tenor.com/1-tiny.gif');
    });

    it('shows the empty state when no GIFs are returned', async () => {
        const wrapper = mount(GifPicker);
        await flushPromises();
        expect(wrapper.text()).toContain('No');
    });
});

describe('GifPicker selection', () => {
    it('emits select with the full-size gif url when present', async () => {
        vi.stubGlobal('fetch', mockFetchOnce([gif('1')]));
        const wrapper = mount(GifPicker);
        await flushPromises();
        const gifButton = wrapper.findAll('button').find((b) => b.find('img').exists());
        await gifButton!.trigger('click');
        expect(wrapper.emitted('select')?.[0]).toEqual(['https://media.tenor.com/1.gif']);
    });

    it('falls back to the tinygif url when the full gif is missing', async () => {
        vi.stubGlobal('fetch', mockFetchOnce([gif('1', { gif: undefined })]));
        const wrapper = mount(GifPicker);
        await flushPromises();
        const gifButton = wrapper.findAll('button').find((b) => b.find('img').exists());
        await gifButton!.trigger('click');
        expect(wrapper.emitted('select')?.[0]).toEqual(['https://media.tenor.com/1-tiny.gif']);
    });

    it('does not emit select when the gif has no usable url', async () => {
        vi.stubGlobal('fetch', mockFetchOnce([gif('1', { gif: undefined, tinygif: undefined })]));
        const wrapper = mount(GifPicker);
        await flushPromises();
        const gifButton = wrapper.findAll('button').find((b) => b.find('img').exists());
        await gifButton!.trigger('click');
        expect(wrapper.emitted('select')).toBeFalsy();
    });
});

describe('GifPicker category navigation', () => {
    it('fetches a search query when a non-trending category is chosen', async () => {
        const fetchMock = mockFetchOnce([gif('1')]);
        vi.stubGlobal('fetch', fetchMock);
        const wrapper = mount(GifPicker);
        await flushPromises();
        fetchMock.mockClear();

        const happyButton = wrapper.findAll('button').find((b) => b.text() === 'Happy');
        await happyButton!.trigger('click');
        await flushPromises();

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[0][0]).toContain('/v2/search?q=happy');
    });
});

describe('GifPicker search clearing', () => {
    it('shows a clear button only when a query is present and resets on click', async () => {
        const wrapper = mount(GifPicker);
        await flushPromises();
        expect(wrapper.find('input').element.value).toBe('');

        await wrapper.find('input').setValue('cats');
        // The clear (X) button is the second button in the header region.
        const clearButton = wrapper.findAll('button').find((b) => b.find('svg').exists());
        await clearButton!.trigger('click');
        await flushPromises();
        expect(wrapper.find('input').element.value).toBe('');
    });
});
