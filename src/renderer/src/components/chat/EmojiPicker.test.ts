import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import EmojiPicker from './EmojiPicker.vue';

// The real vue3-emoji-picker is a heavy DOM widget; stub it with a minimal
// component that re-emits a `select` payload of the same shape ({ i: string }).
vi.mock('vue3-emoji-picker/css', () => ({}));
vi.mock('vue3-emoji-picker', () => ({
    default: defineComponent({
        name: 'Vue3EmojiPickerStub',
        emits: ['select'],
        setup(_props, { emit }) {
            return () =>
                h(
                    'button',
                    {
                        'data-emoji': 'true',
                        onClick: () => emit('select', { i: '😀' }),
                    },
                    'pick',
                );
        },
    }),
}));

describe('EmojiPicker', () => {
    it('forwards the inner picker selection as a `select` string emit', async () => {
        const wrapper = mount(EmojiPicker);
        await flushPromises();
        await wrapper.get('[data-emoji]').trigger('click');
        expect(wrapper.emitted('select')?.[0]).toEqual(['😀']);
    });

    it('renders the wrapper around the lazily-loaded picker', async () => {
        const wrapper = mount(EmojiPicker);
        await flushPromises();
        expect(wrapper.find('.emoji-picker-wrapper').exists()).toBe(true);
    });
});
