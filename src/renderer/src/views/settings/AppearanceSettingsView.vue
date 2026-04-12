<!-- AppearanceSettingsView - Theme and appearance settings -->

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import ThemeSelector from '@/components/ThemeSelector.vue';

const { t } = useI18n();
</script>

<template>
    <div>
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">{{ t('settings.appearance.title') }}</h2>
                <p class="text-muted-foreground mt-1 text-sm">
                    {{ t('settings.appearance.description') }}
                </p>
            </div>
            <div class="p-6">
                <ThemeSelector />
            </div>
        </div>
    </div>
</template>
