import type { Ref } from 'vue';
import { ref } from 'vue';
import { DEFAULT_LOCALE, isSupportedLocale, setLocale, type AppLocale } from '@/i18n';

const language = ref<AppLocale>(DEFAULT_LOCALE);

export async function initializeLanguage(): Promise<void> {
    if (typeof window === 'undefined') {
        return;
    }

    const saved = (await window.api.settings.get('language')) as string | null;
    const resolved = isSupportedLocale(saved) ? saved : DEFAULT_LOCALE;

    if (saved && resolved !== saved) {
        window.api.settings.set('language', resolved);
    }

    language.value = resolved;
    setLocale(resolved);
}

export type UseLanguageReturn = {
    language: Ref<AppLocale>;
    setLanguage: (value: AppLocale) => void;
};

export function useLanguage(): UseLanguageReturn {
    function setLanguage(value: AppLocale): void {
        language.value = value;
        window.api.settings.set('language', value);
        setLocale(value);
    }

    return {
        language,
        setLanguage,
    };
}
