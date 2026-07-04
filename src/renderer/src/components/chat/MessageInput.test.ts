import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDraftMessages } from '@/composables/useDraftMessages';
import type { MessageData } from '@/types/chat';
import MessageInput from './MessageInput.vue';

// Stub heavy child components so tests focus on MessageInput's own logic.
const stubs = {
    EmojiPicker: true,
    GifPicker: true,
    MentionDropdown: true,
    SimpleTooltip: { template: '<div><slot /></div>' },
};

function mountInput(props: Record<string, unknown> = {}) {
    return mount(MessageInput, { props, global: { stubs } });
}

async function type(wrapper: ReturnType<typeof mountInput>, text: string) {
    const textarea = wrapper.get('[data-message-input]');
    await textarea.setValue(text);
    return textarea;
}

describe('MessageInput', () => {
    it('emits "typing" on input', async () => {
        const wrapper = mountInput();
        await type(wrapper, 'hi');
        expect(wrapper.emitted('typing')).toBeTruthy();
    });

    it('sends a valid message on Enter and clears the input', async () => {
        const wrapper = mountInput();
        const textarea = await type(wrapper, 'hello world');
        await textarea.trigger('keydown', { key: 'Enter' });

        const sent = wrapper.emitted('send');
        expect(sent).toBeTruthy();
        expect(sent![0][0]).toBe('hello world');
        expect((textarea.element as HTMLTextAreaElement).value).toBe('');
    });

    it('does not send an empty message', async () => {
        const wrapper = mountInput();
        const textarea = await type(wrapper, '   ');
        await textarea.trigger('keydown', { key: 'Enter' });
        expect(wrapper.emitted('send')).toBeFalsy();
    });

    it('inserts a newline (does not send) on Shift+Enter', async () => {
        const wrapper = mountInput();
        const textarea = await type(wrapper, 'line');
        await textarea.trigger('keydown', { key: 'Enter', shiftKey: true });
        expect(wrapper.emitted('send')).toBeFalsy();
    });

    it('does not send when disabled', async () => {
        const wrapper = mountInput({ disabled: true });
        const textarea = wrapper.get('[data-message-input]');
        await textarea.trigger('keydown', { key: 'Enter' });
        expect(wrapper.emitted('send')).toBeFalsy();
    });

    it('renders a reply preview and emits cancelReply', async () => {
        const replyingTo = {
            id: '7',
            content: 'parent message',
            user: { id: 'u1', username: 'alice' },
            link_preview: null,
        } as unknown as MessageData;
        const wrapper = mountInput({ replyingTo });
        expect(wrapper.text()).toContain('alice');
        expect(wrapper.text()).toContain('parent message');

        // The cancel button is the one rendering the X icon next to the reply preview.
        const buttons = wrapper.findAll('button');
        await buttons[0].trigger('click');
        expect(wrapper.emitted('cancelReply')).toBeTruthy();
    });

    describe('draft persistence', () => {
        afterEach(() => {
            localStorage.clear();
        });

        it('restores a saved draft when mounted with a draftKey', async () => {
            useDraftMessages().setDraft('channel:restore-test', 'unsent text');

            const wrapper = mountInput({ draftKey: 'channel:restore-test' });
            await nextTick();
            const textarea = wrapper.get('[data-message-input]').element as HTMLTextAreaElement;
            expect(textarea.value).toBe('unsent text');
        });

        it('saves the draft after typing, debounced', async () => {
            vi.useFakeTimers();
            const wrapper = mountInput({ draftKey: 'channel:save-test' });
            await type(wrapper, 'work in progress');
            await nextTick();

            vi.advanceTimersByTime(300);
            const stored = JSON.parse(localStorage.getItem('laradisco:message-drafts') ?? '{}');
            expect(stored['channel:save-test'].content).toBe('work in progress');
        });

        it('clears the draft once the message is sent', async () => {
            vi.useFakeTimers();
            const wrapper = mountInput({ draftKey: 'channel:clear-test' });
            const textarea = await type(wrapper, 'ready to send');
            vi.advanceTimersByTime(300);

            await textarea.trigger('keydown', { key: 'Enter' });

            const stored = JSON.parse(localStorage.getItem('laradisco:message-drafts') ?? '{}');
            expect(stored).not.toHaveProperty('channel:clear-test');
        });

        it('saves the previous key draft and loads the new key draft when draftKey changes', async () => {
            vi.useFakeTimers();
            useDraftMessages().setDraft('channel:b', 'draft for b');
            const wrapper = mountInput({ draftKey: 'channel:a' });
            await type(wrapper, 'draft for a');

            await wrapper.setProps({ draftKey: 'channel:b' });
            await nextTick();

            const textarea = wrapper.get('[data-message-input]').element as HTMLTextAreaElement;
            expect(textarea.value).toBe('draft for b');

            const stored = JSON.parse(localStorage.getItem('laradisco:message-drafts') ?? '{}');
            expect(stored['channel:a'].content).toBe('draft for a');
        });
    });
});
