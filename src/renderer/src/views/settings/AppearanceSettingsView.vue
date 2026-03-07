<!-- AppearanceSettingsView - Theme and appearance settings -->

<script setup lang="ts">
import ThemeSelector from '@/components/ThemeSelector.vue';
</script>

<template>
    <div>
        <div class="rounded-lg border bg-card">
            <div class="border-b bg-muted/50 px-6 py-4">
                <h2 class="text-lg font-semibold">Theme</h2>
                <p class="mt-1 text-sm text-muted-foreground">
                    Select a theme to change the look and feel of the application
                </p>
            </div>
            <div class="p-6">
                <ThemeSelector />
            </div>
        </div>
    </div>
</template>
