import { afterEach, beforeAll, vi } from 'vitest';

beforeAll(() => {
    process.env.TZ = 'UTC';
});

afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
});
