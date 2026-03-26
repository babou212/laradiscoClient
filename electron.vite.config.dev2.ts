import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'electron-vite';

function copyWasmPlugin() {
    return {
        name: 'copy-wasm',
        closeBundle() {
            const outDir = resolve('out2/main/wasm');
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
            outDir: 'out2/main',
            externalizeDeps: true,
        },
        plugins: [copyWasmPlugin()],
        resolve: {
            alias: {
                '@main': resolve('src/main'),
            },
        },
    },
    preload: {
        build: {
            outDir: 'out2/preload',
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
        resolve: {
            alias: {
                '@': resolve('src/renderer/src'),
            },
        },
        plugins: [
            tailwindcss(),
            vue(),
        ],
    },
});
