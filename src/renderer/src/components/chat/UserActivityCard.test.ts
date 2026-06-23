import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserActivity } from '@/types/user';
import UserActivityCard from './UserActivityCard.vue';

function activity(overrides: Partial<UserActivity> = {}): UserActivity {
    return {
        type: 'game',
        name: 'Counter-Strike 2',
        details: null,
        icon: null,
        application_id: 'steam-730',
        started_at: Math.floor(new Date('2026-06-23T11:58:30Z').getTime() / 1000), // 90s before "now"
        ...overrides,
    } as UserActivity;
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-23T12:00:00Z'));
});

afterEach(() => vi.useRealTimers());

describe('UserActivityCard', () => {
    it('shows the activity verb and name', () => {
        const wrapper = mount(UserActivityCard, { props: { activity: activity() } });
        expect(wrapper.text()).toContain('Playing');
        expect(wrapper.text()).toContain('Counter-Strike 2');
    });

    it('uses the type-specific verb for music and apps', () => {
        expect(mount(UserActivityCard, { props: { activity: activity({ type: 'music' }) } }).text()).toContain(
            'Listening to',
        );
        expect(mount(UserActivityCard, { props: { activity: activity({ type: 'app' }) } }).text()).toContain('Using');
    });

    it('renders the elapsed time since started_at', () => {
        const wrapper = mount(UserActivityCard, { props: { activity: activity() } });
        // 90 seconds elapsed -> "1m"
        expect(wrapper.text()).toContain('for 1m');
    });

    it('shows the icon image when provided and falls back on error', async () => {
        const wrapper = mount(UserActivityCard, { props: { activity: activity({ icon: 'https://cdn/icon.png' }) } });
        const img = wrapper.find('img');
        expect(img.exists()).toBe(true);

        await img.trigger('error');
        expect(wrapper.find('img').exists()).toBe(false); // fell back to the lucide icon
    });

    it('renders the fallback icon (no img) when there is no icon', () => {
        const wrapper = mount(UserActivityCard, { props: { activity: activity({ icon: null }) } });
        expect(wrapper.find('img').exists()).toBe(false);
    });

    it('shows details when present', () => {
        const wrapper = mount(UserActivityCard, { props: { activity: activity({ details: 'de_dust2' }) } });
        expect(wrapper.text()).toContain('de_dust2');
    });
});
