<script setup lang="ts">
import AppContent from '@/components/AppContent.vue';
import AppHeader from '@/components/AppHeader.vue';
import AppShell from '@/components/AppShell.vue';
import AppSidebar from '@/components/AppSidebar.vue';
</script>

<template>
    <AppShell variant="sidebar">
        <AppSidebar />
        <AppContent variant="sidebar" class="flex flex-col overflow-hidden">
            <AppHeader />
            <div class="flex min-h-0 flex-1 overflow-hidden">
                <main class="min-h-0 flex-1 overflow-y-auto">
                    <slot />
                </main>
            </div>
        </AppContent>
    </AppShell>
</template>
