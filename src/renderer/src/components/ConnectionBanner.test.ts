import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
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
});
