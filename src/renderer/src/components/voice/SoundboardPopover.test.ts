import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sound } from '@/api/soundboard';
import SoundboardPopover from './SoundboardPopover.vue';

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

// Render popover content inline instead of through reka-ui's teleporting portal.
const stubs = {
    SimpleTooltip: { template: '<div><slot /></div>' },
    PopoverRoot: { template: '<div><slot /></div>' },
    PopoverTrigger: { template: '<div><slot /></div>' },
    PopoverPortal: { template: '<div><slot /></div>' },
    PopoverContent: { template: '<div><slot /></div>' },
    Slider: { name: 'Slider', props: ['modelValue', 'min', 'max', 'step'], template: '<div data-stub="slider" />' },
    SoundUploadDialog: { name: 'SoundUploadDialog', props: ['open'], template: '<div data-stub="upload" />' },
};

function sound(overrides: Partial<Sound> = {}): Sound {
    return {
        id: '1',
        name: 'Airhorn',
        durationMs: 4200,
        url: 'https://cdn.test/a.ogg',
        mimeType: 'audio/ogg',
        uploadedById: '7',
        ...overrides,
    };
}

function mountPopover() {
    return mount(SoundboardPopover, { global: { stubs } });
}

beforeEach(() => {
    storeStub.sounds = [];
    storeStub.isLoading = false;
    storeStub.playingId = null;
    storeStub.canDelete.mockReturnValue(false);
    vi.clearAllMocks();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('SoundboardPopover', () => {
    it('shows the empty state when there are no sounds', () => {
        const wrapper = mountPopover();
        expect(wrapper.text()).toContain('No sounds yet');
    });

    it('renders a tile per sound and triggers it on click', async () => {
        storeStub.sounds = [sound({ id: '1', name: 'Airhorn' }), sound({ id: '2', name: 'Boo' })];
        const wrapper = mountPopover();

        const tile = wrapper.findAll('button').find((b) => b.text() === 'Boo');
        expect(tile).toBeTruthy();

        await tile!.trigger('click');
        await flushPromises();

        expect(storeStub.trigger).toHaveBeenCalledWith('2');
    });

    it('hides the delete button when the user cannot delete', () => {
        storeStub.sounds = [sound()];
        storeStub.canDelete.mockReturnValue(false);
        const wrapper = mountPopover();

        expect(wrapper.find('[title="Delete sound"]').exists()).toBe(false);
    });

    it('deletes a sound after confirmation when permitted', async () => {
        storeStub.sounds = [sound({ id: '9' })];
        storeStub.canDelete.mockReturnValue(true);
        vi.stubGlobal(
            'confirm',
            vi.fn(() => true),
        );
        const wrapper = mountPopover();

        const deleteBtn = wrapper.find('[title="Delete sound"]');
        expect(deleteBtn.exists()).toBe(true);

        await deleteBtn.trigger('click');
        await flushPromises();

        expect(storeStub.remove).toHaveBeenCalledWith('9');
    });

    it('does not delete when confirmation is declined', async () => {
        storeStub.sounds = [sound({ id: '9' })];
        storeStub.canDelete.mockReturnValue(true);
        vi.stubGlobal(
            'confirm',
            vi.fn(() => false),
        );
        const wrapper = mountPopover();

        await wrapper.find('[title="Delete sound"]').trigger('click');
        await flushPromises();

        expect(storeStub.remove).not.toHaveBeenCalled();
    });

    it('opens the upload dialog from the add button', async () => {
        const wrapper = mountPopover();

        const addBtn = wrapper.findAll('button').find((b) => b.text().includes('Add sound'));
        await addBtn!.trigger('click');
        await flushPromises();

        expect(wrapper.findComponent({ name: 'SoundUploadDialog' }).props('open')).toBe(true);
    });
});
