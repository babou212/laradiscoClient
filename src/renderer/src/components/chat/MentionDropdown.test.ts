import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MentionDropdown from './MentionDropdown.vue';

const searchMentions = vi.fn();
vi.mock('@/api/members', () => ({ searchMentions: (...a: unknown[]) => searchMentions(...a) }));

function userRes(id: string, username: string) {
    return { id, attributes: { username, display_name: username, avatar_urls: null } };
}

beforeEach(() => {
    searchMentions.mockReset().mockResolvedValue({ data: [] });
});

describe('MentionDropdown special mentions', () => {
    it('offers @everyone and @here on an empty query', async () => {
        const wrapper = mount(MentionDropdown, { props: { query: '', visible: true } });
        await flushPromises();
        expect(wrapper.text()).toContain('@everyone');
        expect(wrapper.text()).toContain('@here');
    });

    it('filters specials by prefix', async () => {
        const wrapper = mount(MentionDropdown, { props: { query: 'her', visible: true } });
        await flushPromises();
        expect(wrapper.text()).toContain('@here');
        expect(wrapper.text()).not.toContain('@everyone');
    });

    it('is hidden when not visible', () => {
        const wrapper = mount(MentionDropdown, { props: { query: '', visible: false } });
        expect(wrapper.find('button').exists()).toBe(false);
    });
});

describe('MentionDropdown user search', () => {
    it('queries the API and renders matching users', async () => {
        searchMentions.mockResolvedValue({ data: [userRes('1', 'alice'), userRes('2', 'alex')] });
        // The search runs from a (non-immediate) watch, so change the query after mount.
        const wrapper = mount(MentionDropdown, { props: { query: '', visible: true } });
        await wrapper.setProps({ query: 'al' });
        await flushPromises();
        expect(searchMentions).toHaveBeenCalled();
        expect(wrapper.text()).toContain('@alice');
        expect(wrapper.text()).toContain('@alex');
    });

    it('does not search for the reserved words everyone/here', async () => {
        const wrapper = mount(MentionDropdown, { props: { query: '', visible: true } });
        await wrapper.setProps({ query: 'everyone' });
        await flushPromises();
        expect(searchMentions).not.toHaveBeenCalled();
    });
});

describe('MentionDropdown keyboard navigation', () => {
    it('selects the highlighted item on Enter', async () => {
        const wrapper = mount(MentionDropdown, { props: { query: '', visible: true } });
        await flushPromises();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await flushPromises();
        expect(wrapper.emitted('select')?.[0]).toEqual(['everyone']);
    });

    it('moves the selection down then selects', async () => {
        const wrapper = mount(MentionDropdown, { props: { query: '', visible: true } });
        await flushPromises();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
        await flushPromises();
        expect(wrapper.emitted('select')?.[0]).toEqual(['here']);
    });

    it('emits close on Escape', async () => {
        const wrapper = mount(MentionDropdown, { props: { query: '', visible: true } });
        await flushPromises();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(wrapper.emitted('close')).toBeTruthy();
    });

    it('emits select with the clicked username', async () => {
        searchMentions.mockResolvedValue({ data: [userRes('1', 'alice')] });
        const wrapper = mount(MentionDropdown, { props: { query: '', visible: true } });
        await wrapper.setProps({ query: 'al' });
        await flushPromises();
        const aliceButton = wrapper.findAll('button').find((b) => b.text().includes('@alice'));
        await aliceButton!.trigger('click');
        expect(wrapper.emitted('select')?.[0]).toEqual(['alice']);
    });
});
