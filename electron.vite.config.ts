import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'electron-vite';

function copyWasmPlugin() {
    return {
        name: 'copy-wasm',
        closeBundle() {
            const outDir = resolve('out/main/wasm');
            if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
            const srcDir = resolve('src/main/mls/wasm');
            for (const file of ['openmls_wasm.js', 'openmls_wasm_bg.wasm', 'package.json']) {
                copyFileSync(resolve(srcDir, file), resolve(outDir, file));
            }
        },
    };
}

export default defineConfig({
    main: {
        build: {
            externalizeDeps: true,
            sourcemap: true,
        },
        plugins: [
            copyWasmPlugin(),
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
