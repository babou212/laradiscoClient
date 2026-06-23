import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TypingIndicator from './TypingIndicator.vue';

function typingMap(names: string[]) {
    return new Map(
        names.map((username, i) => [i, { username, timeout: 0 as unknown as ReturnType<typeof setTimeout> }]),
    );
}

describe('TypingIndicator', () => {
    it('renders nothing when no one is typing', () => {
        const wrapper = mount(TypingIndicator, { props: { typingUsers: typingMap([]) } });
        expect(wrapper.text()).toBe('');
    });

    it('shows a single typer by name', () => {
        const wrapper = mount(TypingIndicator, { props: { typingUsers: typingMap(['alice']) } });
        expect(wrapper.text()).toContain('alice');
    });

    it('renders a message when several users type', () => {
        const wrapper = mount(TypingIndicator, { props: { typingUsers: typingMap(['alice', 'bob']) } });
        expect(wrapper.text().length).toBeGreaterThan(0);
    });
});
