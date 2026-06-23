import { createApp } from 'vue';

/**
 * Run a composable inside a real component instance so lifecycle hooks
 * (onMounted / onUnmounted) fire. Returns the composable result plus an
 * `unmount` to trigger cleanup.
 */
export function withSetup<T>(composable: () => T): { result: T; unmount: () => void } {
    let result!: T;
    const app = createApp({
        setup() {
            result = composable();
            return () => null;
        },
    });
    app.mount(document.createElement('div'));
    return { result, unmount: () => app.unmount() };
}
