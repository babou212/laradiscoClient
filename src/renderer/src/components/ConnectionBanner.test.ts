import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useConnectionStore } from '@/stores/connection';
import ConnectionBanner from './ConnectionBanner.vue';

async function mountWithStatus(status: 'connected' | 'reconnecting' | 'disconnected') {
    const wrapper = mount(ConnectionBanner);
    const store = useConnectionStore();
    store.status = status;
    await flushPromises();
    return wrapper;
}

describe('ConnectionBanner', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('renders nothing while connected', async () => {
        const wrapper = await mountWithStatus('connected');
        expect(wrapper.text()).toBe('');
    });

    it('shows the reconnecting message', async () => {
        const wrapper = await mountWithStatus('reconnecting');
        expect(wrapper.text()).toContain('Reconnecting to server');
        expect(wrapper.get('[role="status"]')).toBeTruthy();
    });

    it('shows the lost-connection alert', async () => {
        const wrapper = await mountWithStatus('disconnected');
        expect(wrapper.text()).toContain('Lost connection to server');
        expect(wrapper.get('[role="alert"]')).toBeTruthy();
    });

    it('flashes a Connected banner after recovering, then auto-dismisses', async () => {
        vi.useFakeTimers();
        const wrapper = mount(ConnectionBanner);
        const store = useConnectionStore();

        store.status = 'reconnecting';
        await flushPromises();
        expect(wrapper.text()).toContain('Reconnecting to server');

        store.status = 'connected';
        await flushPromises();
        expect(wrapper.text()).toContain('Connected');
        expect(wrapper.get('[role="status"]')).toBeTruthy();

        vi.advanceTimersByTime(2500);
        await flushPromises();
        expect(wrapper.text()).not.toContain('Connected');
    });
});
