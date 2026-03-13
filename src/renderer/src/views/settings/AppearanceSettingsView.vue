<!-- AppearanceSettingsView - Theme and appearance settings -->

<script setup lang="ts">
import ThemeSelector from '@/components/ThemeSelector.vue';
</script>

<template>
    <div>
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">Theme</h2>
                <p class="text-muted-foreground mt-1 text-sm">
                    Select a theme to change the look and feel of the application
                </p>
            </div>
            <div class="p-6">
                <ThemeSelector />
            </div>
        </div>
    </div>
</template>
