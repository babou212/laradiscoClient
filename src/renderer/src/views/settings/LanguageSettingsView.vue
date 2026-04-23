<script setup lang="ts">
import { Check } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { useLanguage } from '@/composables/useLanguage';
import { SUPPORTED_LOCALES, type AppLocale } from '@/i18n';

const { t } = useI18n();
const { language, setLanguage } = useLanguage();

function selectLanguage(value: AppLocale): void {
    setLanguage(value);
}
</script>

<template>
    <div>
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">{{ t('settings.language.title') }}</h2>
                <p class="text-muted-foreground mt-1 text-sm">
                    {{ t('settings.language.description') }}
                </p>
            </div>
            <div class="p-6">
                <div class="grid gap-3 sm:grid-cols-2">
                    <button
                        v-for="locale in SUPPORTED_LOCALES"
                        :key="locale"
                        type="button"
                        @click="selectLanguage(locale)"
                        :class="[
                            'group relative flex items-center gap-3 rounded-lg border-2 p-4 text-left transition-all',
                            language === locale
                                ? 'border-primary bg-primary/5 shadow-sm'
                                : 'border-border hover:border-primary/40 hover:bg-accent',
                        ]"
                    >
                        <div class="flex-1">
                            <div class="text-sm font-medium">
                                {{ t(`settings.language.options.${locale}`) }}
                            </div>
                            <div class="text-muted-foreground text-xs uppercase">{{ locale }}</div>
                        </div>
                        <div
                            v-if="language === locale"
                            class="bg-primary text-primary-foreground flex h-5 w-5 items-center justify-center rounded-full"
                        >
                            <Check class="h-3 w-3" />
                        </div>
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
