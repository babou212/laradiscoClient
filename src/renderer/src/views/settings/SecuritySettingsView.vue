<script setup lang="ts">
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
    <div class="space-y-6">
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">{{ t('settings.security.title') }}</h2>
                <p class="text-muted-foreground mt-1 text-sm">{{ t('settings.security.description') }}</p>
            </div>
        </div>
    </div>
</template>
