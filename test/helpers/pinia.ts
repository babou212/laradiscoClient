import { createTestingPinia } from '@pinia/testing';
import { createPinia, setActivePinia } from 'pinia';
import { vi } from 'vitest';

/**
 * Real Pinia for store-logic tests: the store under test runs for real and its
 * sibling stores instantiate lazily. Mock only the api/echo edges in the test.
 */
export function setupTestPinia() {
    const pinia = createPinia();
    setActivePinia(pinia);
    return pinia;
}

/**
 * Testing Pinia for component tests: real getters, spy-able actions. Pass
 * `stubActions: false` when a mounted component relies on an action's effects.
 */
export function createComponentPinia(options: Parameters<typeof createTestingPinia>[0] = {}) {
    return createTestingPinia({ createSpy: vi.fn, ...options });
}
