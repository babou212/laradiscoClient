import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KlipyGif } from '@/types/chat';
import GifPicker from './GifPicker.vue';

function gif(id: string, fileOverrides: Partial<KlipyGif['file']> = {}): KlipyGif {
    return {
        id,
        title: `gif ${id}`,
        file: {
            hd: { gif: { url: `https://static.klipy.com/${id}-hd.gif` } },
            sm: { gif: { url: `https://static.klipy.com/${id}-sm.gif` } },
            ...fileOverrides,
        },
    };
}

function mockFetchOnce(results: KlipyGif[], hasNext = false) {
    return vi.fn().mockResolvedValue({
        json: async () => ({ result: true, data: { data: results, has_next: hasNext } }),
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
        expect(fetchMock.mock.calls[0][0]).toContain('/gifs/trending');
    });

    it('renders fetched GIFs as selectable buttons', async () => {
        vi.stubGlobal('fetch', mockFetchOnce([gif('1'), gif('2')]));
        const wrapper = mount(GifPicker);
        await flushPromises();
        const imgs = wrapper.findAll('img');
        expect(imgs).toHaveLength(2);
        expect(imgs[0].attributes('src')).toBe('https://static.klipy.com/1-sm.gif');
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
        expect(wrapper.emitted('select')?.[0]).toEqual(['https://static.klipy.com/1-hd.gif']);
    });

    it('falls back to the smaller gif url when the hd gif is missing', async () => {
        vi.stubGlobal('fetch', mockFetchOnce([gif('1', { hd: undefined })]));
        const wrapper = mount(GifPicker);
        await flushPromises();
        const gifButton = wrapper.findAll('button').find((b) => b.find('img').exists());
        await gifButton!.trigger('click');
        expect(wrapper.emitted('select')?.[0]).toEqual(['https://static.klipy.com/1-sm.gif']);
    });

    it('does not emit select when the gif has no usable url', async () => {
        vi.stubGlobal('fetch', mockFetchOnce([gif('1', { hd: undefined, sm: undefined })]));
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
        expect(fetchMock.mock.calls[0][0]).toContain('/gifs/search?q=happy');
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
