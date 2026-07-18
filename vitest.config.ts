import { resolve } from 'path';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

const rendererAlias = { '@': resolve('src/renderer/src') };
const mainAlias = {
    '@main': resolve('src/main'),
    electron: resolve('test/mocks/electron.ts'),
};

export default defineConfig({
    test: {
        projects: [
            {
                resolve: { alias: mainAlias },
                test: {
                    name: 'main',
                    environment: 'node',
                    include: ['src/main/**/*.test.ts', 'src/preload/**/*.test.ts'],
                    globals: true,
                    setupFiles: ['test/setup.main.ts'],
                },
            },
            {
                plugins: [vue()],
                resolve: { alias: rendererAlias },
                test: {
                    name: 'renderer',
                    environment: 'jsdom',
                    include: ['src/renderer/**/*.test.ts'],
                    globals: true,
                    setupFiles: ['test/setup.renderer.ts'],
                    server: {
                        deps: { inline: ['vue-i18n'] },
                    },
                },
            },
        ],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['src/main/**', 'src/preload/**', 'src/renderer/src/**'],
            exclude: [
                '**/*.wasm',
                '**/*.d.ts',
                '**/*.test.ts',
                'src/renderer/src/i18n/locales/**',
                'src/**/index.ts',
            ],
        },
    },
});
