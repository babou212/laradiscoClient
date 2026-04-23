import type { Locale } from 'date-fns';
import { da, de, enUS, es, fr, nl, pl, ptBR, ru, zhCN } from 'date-fns/locale';
import { ref } from 'vue';
import { createI18n } from 'vue-i18n';
import daMessages from './locales/da.json';
import deMessages from './locales/de.json';
import en from './locales/en.json';
import esMessages from './locales/es.json';
import frMessages from './locales/fr.json';
import nlMessages from './locales/nl.json';
import plMessages from './locales/pl.json';
import ptMessages from './locales/pt.json';
import ruMessages from './locales/ru.json';
import zhMessages from './locales/zh.json';

export type AppLocale = 'en' | 'es' | 'de' | 'fr' | 'pl' | 'pt' | 'ru' | 'zh' | 'da' | 'nl';

export const SUPPORTED_LOCALES: readonly AppLocale[] = [
    'en',
    'es',
    'de',
    'fr',
    'pl',
    'pt',
    'ru',
    'zh',
    'da',
    'nl',
] as const;
export const DEFAULT_LOCALE: AppLocale = 'en';

const dateFnsLocaleMap: Record<AppLocale, Locale> = {
    en: enUS,
    es,
    de,
    fr,
    pl,
    pt: ptBR,
    ru,
    zh: zhCN,
    da,
    nl,
};

export const currentDateFnsLocale = ref<Locale>(dateFnsLocaleMap[DEFAULT_LOCALE]);

export const i18n = createI18n({
    legacy: false,
    locale: DEFAULT_LOCALE,
    fallbackLocale: 'en',
    messages: {
        en,
        es: esMessages,
        de: deMessages,
        fr: frMessages,
        pl: plMessages,
        pt: ptMessages,
        ru: ruMessages,
        zh: zhMessages,
        da: daMessages,
        nl: nlMessages,
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
