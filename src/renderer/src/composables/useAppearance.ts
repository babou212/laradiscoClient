import type { Ref } from 'vue';
import { onMounted, ref } from 'vue';
import type { Theme } from '@/types';

export type { Theme };

const DARK_THEMES: ReadonlySet<Theme> = new Set([
    'default-dark',
    'dracula',
    'nord-dark',
    'midnight',
    'cyberpunk',
    'monokai',
    'emerald',
    'solarized-dark',
    'crimson',
]);

export function isDarkTheme(theme: Theme): boolean {
    return DARK_THEMES.has(theme);
}

export type UseAppearanceReturn = {
    theme: Ref<Theme>;
    updateThemeLocally: (value: Theme) => void;
};

export function applyTheme(value: Theme): void {
    if (typeof document === 'undefined') {
        return;
    }

    if (value === 'default' || value === 'default-dark') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', value);
    }

    document.documentElement.classList.toggle('dark', isDarkTheme(value));
}

export async function initializeTheme(): Promise<void> {
    if (typeof window === 'undefined') {
        return;
    }

    const savedTheme = (await window.api.settings.get('theme')) as Theme | null;
    applyTheme(savedTheme || 'default');
}

const theme = ref<Theme>('default');

export function useAppearance(): UseAppearanceReturn {
    onMounted(async () => {
        const savedTheme = (await window.api.settings.get('theme')) as Theme | null;

        if (savedTheme) {
            theme.value = savedTheme;
            applyTheme(savedTheme);
        }
    });

    function updateThemeLocally(value: Theme) {
        theme.value = value;

        window.api.settings.set('theme', value);

        applyTheme(value);
    }

    return {
        theme,
        updateThemeLocally,
    };
}
