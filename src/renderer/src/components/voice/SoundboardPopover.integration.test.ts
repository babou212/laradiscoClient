import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sound } from '@/api/soundboard';
import SoundboardPopover from './SoundboardPopover.vue';

// Same store stub as the unit test, but here we render the REAL reka-ui Popover
// (no Popover stubs) so the trigger/anchor wiring is actually exercised.
const storeStub = vi.hoisted(() => ({
    sounds: [] as Sound[],
    isLoading: false,
    playingId: null as string | null,
    volume: 1,
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    trigger: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    canDelete: vi.fn(() => false),
    setVolume: vi.fn(),
}));

vi.mock('@/stores/soundboard', () => ({ useSoundboardStore: () => storeStub }));

// Only stub the leaf children that are noisy/irrelevant here.
const stubs = {
    Slider: { template: '<div data-stub="slider" />' },
    SoundUploadDialog: { name: 'SoundUploadDialog', props: ['open'], template: '<div data-stub="upload" />' },
};

beforeEach(() => {
    storeStub.sounds = [];
    storeStub.isLoading = false;
    vi.clearAllMocks();
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('SoundboardPopover open behaviour (real reka-ui)', () => {
    it('opens the panel and lazy-loads sounds when the trigger is clicked', async () => {
        const wrapper = mount(SoundboardPopover, { attachTo: document.body, global: { stubs } });

        // Panel content is not present before opening.
        expect(document.body.textContent).not.toContain('No sounds yet');

        await wrapper.get('button').trigger('click');
        await flushPromises();

        // The trigger toggled open: the library was fetched and the panel rendered.
        expect(storeStub.ensureLoaded).toHaveBeenCalledTimes(1);
        expect(document.body.textContent).toContain('No sounds yet');

        wrapper.unmount();
    });
});
