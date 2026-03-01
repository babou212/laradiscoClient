import { resolve } from 'path';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'electron-vite';

export default defineConfig({
    main: {
        build: {
            externalizeDeps: true,
        },
        resolve: {
            alias: {
                '@main': resolve('src/main'),
            },
        },
    },
    preload: {
        build: {
            externalizeDeps: true,
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
