import './assets/css/main.css';

import { PiniaColada } from '@pinia/colada';
import Aura from '@primeuix/themes/aura';
import log from 'electron-log/renderer';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { createApp } from 'vue';
import App from './App.vue';
import { initializeTheme } from './composables/useAppearance';
import { initializeLanguage } from './composables/useLanguage';
import { i18n } from './i18n';
import router from './router';

// Kick this off before anything else so the preloader (visible since first
// paint, before this script even finishes loading) picks up the real saved
// theme instead of sitting on the CSS fallback colors any longer than needed.
void initializeTheme();

const app = createApp(App);

// Forward renderer errors to the main-process log file (via electron-log's IPC
// bridge — see the electron-log/preload import in src/preload/index.ts).
app.config.errorHandler = (err, _instance, info) => {
    log.error('[vue]', info, err);
};
window.addEventListener('error', (e) => {
    log.error('[window.onerror]', e.message, e.error ?? e);
});
window.addEventListener('unhandledrejection', (e) => {
    log.error('[unhandledrejection]', e.reason);
});
log.info('renderer booted');

app.use(createPinia());
app.use(PiniaColada);
app.use(i18n);
app.use(router);
app.use(PrimeVue, {
    theme: {
        preset: Aura,
        options: {
            darkModeSelector: '.dark',
        },
    },
});

app.mount('#app');

initializeLanguage();

// Intro: keep the boot animation on screen for at least 2 seconds, even if
// the server/session check resolves instantly.
const MIN_PRELOADER_MS = 2000;
const preloaderShownAt = performance.now();

// Dev-only: visit http://localhost:5173/?preview-loader to keep the preloader
// on screen indefinitely while iterating on it, without needing to log in.
const previewingLoader = import.meta.env.DEV && new URLSearchParams(location.search).has('preview-loader');

if (!previewingLoader) {
    router.isReady().finally(() => {
        const preloader = document.getElementById('preloader');
        if (!preloader) return;
        const remaining = MIN_PRELOADER_MS - (performance.now() - preloaderShownAt);
        setTimeout(
            () => {
                preloader.classList.add('preloader-hidden');
                preloader.addEventListener('transitionend', () => preloader.remove(), { once: true });
            },
            Math.max(remaining, 0),
        );
    });
}
