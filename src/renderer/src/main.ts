import './assets/css/main.css';

import { PiniaColada } from '@pinia/colada';
import Aura from '@primeuix/themes/aura';
import * as Sentry from '@sentry/electron/renderer';
import { browserTracingIntegration as vueBrowserTracingIntegration, vueIntegration } from '@sentry/vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { createApp } from 'vue';
import App from './App.vue';
import { initializeTheme } from './composables/useAppearance';
import { initializeLanguage } from './composables/useLanguage';
import { i18n } from './i18n';
import router from './router';

const app = createApp(App);

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

Sentry.init({
    integrations: [
        vueIntegration({
            app,
            tracingOptions: {
                trackComponents: true,
                hooks: ['activate', 'create', 'unmount', 'mount', 'update'],
            },
        }),
        vueBrowserTracingIntegration({ router, routeLabel: 'path' }),
    ] as NonNullable<Parameters<typeof Sentry.init>[0]>['integrations'],
});

app.mount('#app');

initializeTheme();
initializeLanguage();
