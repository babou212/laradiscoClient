<script setup lang="ts">
import { SidebarProvider } from '@/components/ui/sidebar';
import type { AppShellVariant } from '@/types';

type Props = {
    variant?: AppShellVariant;
};

defineProps<Props>();
</script>

<template>
    <div v-if="variant === 'header'" class="flex h-full w-full flex-col">
        <slot />
    </div>
    <SidebarProvider v-else>
        <slot />
    </SidebarProvider>
</template>
