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

initializeTheme();
initializeLanguage();
