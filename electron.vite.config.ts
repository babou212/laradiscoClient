import { resolve } from 'path';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'electron-vite';

export default defineConfig({
    main: {
        build: {
            externalizeDeps: true,
            sourcemap: true,
        },
        plugins: [
            process.env.SENTRY_AUTH_TOKEN
                ? sentryVitePlugin({
                      org: 'laradisco',
                      project: 'electron',
                      authToken: process.env.SENTRY_AUTH_TOKEN,
                      sourcemaps: {
                          filesToDeleteAfterUpload: ['out/main/**/*.map'],
                      },
                  })
                : null,
        ].filter(Boolean),
        resolve: {
            alias: {
                '@main': resolve('src/main'),
            },
        },
    },
    preload: {
        build: {
            externalizeDeps: false,
            rollupOptions: {
                external: ['electron'],
                output: {
                    format: 'cjs',
                    entryFileNames: '[name].js',
                },
            },
        },
    },
    renderer: {
        build: {
            sourcemap: true,
        },
        resolve: {
            alias: {
                '@': resolve('src/renderer/src'),
            },
        },
        plugins: [
            tailwindcss(),
            vue(),
            process.env.SENTRY_AUTH_TOKEN
                ? sentryVitePlugin({
                      org: 'laradisco',
                      project: 'electron',
                      authToken: process.env.SENTRY_AUTH_TOKEN,
                      sourcemaps: {
                          filesToDeleteAfterUpload: ['out/renderer/**/*.map'],
                      },
                  })
                : null,
        ].filter(Boolean),
    },
});
