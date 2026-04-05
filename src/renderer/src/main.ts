import './assets/css/main.css';

import { PiniaColada } from '@pinia/colada';
import Aura from '@primeuix/themes/aura';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { createApp } from 'vue';
import App from './App.vue';
import { initializeTheme } from './composables/useAppearance';
import router from './router';

const app = createApp(App);

app.use(createPinia());
app.use(PiniaColada);
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
