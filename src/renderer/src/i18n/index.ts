import type { Locale } from 'date-fns';
import { enUS, es } from 'date-fns/locale';
import { ref } from 'vue';
import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import esMessages from './locales/es.json';

export type AppLocale = 'en' | 'es';

export const SUPPORTED_LOCALES: readonly AppLocale[] = ['en', 'es'] as const;
export const DEFAULT_LOCALE: AppLocale = 'en';

const dateFnsLocaleMap: Record<AppLocale, Locale> = {
    en: enUS,
    es,
};

export const currentDateFnsLocale = ref<Locale>(dateFnsLocaleMap[DEFAULT_LOCALE]);

export const i18n = createI18n({
    legacy: false,
    locale: DEFAULT_LOCALE,
    fallbackLocale: 'en',
    messages: {
        en,
        es: esMessages,
    },
});

export function isSupportedLocale(value: unknown): value is AppLocale {
    return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function setLocale(locale: AppLocale): void {
    i18n.global.locale.value = locale;
    currentDateFnsLocale.value = dateFnsLocaleMap[locale];
    if (typeof document !== 'undefined') {
        document.documentElement.lang = locale;
    }
}

export const t = i18n.global.t;
