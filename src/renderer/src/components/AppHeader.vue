<script setup lang="ts">
import { computed } from 'vue';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useServerStore } from '@/stores/server';

const serverStore = useServerStore();

const serverName = computed(() => serverStore.activeServer?.name ?? 'LaraDisco');
</script>

<template>
    <header
        class="border-sidebar-border/70 flex h-16 shrink-0 items-center gap-2 border-b px-6 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-4"
    >
        <div class="flex items-center gap-2">
            <SidebarTrigger class="-ml-1" />
            <span class="text-muted-foreground text-sm font-medium">{{ serverName }}</span>
        </div>
        <div class="ml-auto flex items-center gap-2">
            <slot name="actions" />
        </div>
    </header>
</template>
