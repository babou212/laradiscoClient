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

const VALID_THEMES: ReadonlySet<Theme> = new Set<Theme>(['default', ...DARK_THEMES]);

export function isDarkTheme(theme: Theme): boolean {
    return DARK_THEMES.has(theme);
}

function normalizeTheme(value: string | null | undefined): Theme {
    if (value && VALID_THEMES.has(value as Theme)) {
        return value as Theme;
    }
    return 'default-dark';
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

    const savedTheme = (await window.api.settings.get('theme')) as string | null;
    const resolved = normalizeTheme(savedTheme);
    if (savedTheme && resolved !== savedTheme) {
        window.api.settings.set('theme', resolved);
    }
    applyTheme(resolved);
}

const theme = ref<Theme>('default-dark');

export function useAppearance(): UseAppearanceReturn {
    onMounted(async () => {
        const savedTheme = (await window.api.settings.get('theme')) as string | null;
        const resolved = normalizeTheme(savedTheme);

        if (savedTheme && resolved !== savedTheme) {
            window.api.settings.set('theme', resolved);
        }

        theme.value = resolved;
        applyTheme(resolved);
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
