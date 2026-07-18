import { config } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { createApp } from 'vue';
import { i18n } from '@/i18n';
import { createWindowApiMock } from './helpers/windowApi';

beforeAll(() => {
    process.env.TZ = 'UTC';

    if (!('scrollIntoView' in Element.prototype)) {
        Element.prototype.scrollIntoView = vi.fn();
    }
    Element.prototype.scrollIntoView = vi.fn();

    class FakeObserver {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
        takeRecords = vi.fn(() => []);
    }
    vi.stubGlobal('ResizeObserver', FakeObserver);
    vi.stubGlobal('IntersectionObserver', FakeObserver);

    if (!('createObjectURL' in URL)) {
        // @ts-expect-error jsdom stub
        URL.createObjectURL = vi.fn(() => 'blob:mock');
        // @ts-expect-error jsdom stub
        URL.revokeObjectURL = vi.fn();
    } else {
        URL.createObjectURL = vi.fn(() => 'blob:mock');
        URL.revokeObjectURL = vi.fn();
    }

    if (!window.matchMedia) {
        window.matchMedia = vi.fn().mockImplementation((query: string) => ({
            matches: false,
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        }));
    }

    window.Pusher = window.Pusher ?? vi.fn();

});

beforeEach(() => {
    const pinia = createPinia();
    createApp({}).use(pinia);
    setActivePinia(pinia);
    config.global.plugins = [i18n, pinia];
    window.api = createWindowApiMock();
    window.electron = { process: { platform: 'linux' }, ipcRenderer: { on: vi.fn(), send: vi.fn(), invoke: vi.fn() } };
});

afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
});
