<script setup lang="ts">
import type { TooltipContentProps } from 'reka-ui';
import Tooltip from './Tooltip.vue';
import TooltipContent from './TooltipContent.vue';
import TooltipTrigger from './TooltipTrigger.vue';

withDefaults(
    defineProps<{
        content: string;
        side?: TooltipContentProps['side'];
        disabled?: boolean;
    }>(),
    {
        side: 'top',
        disabled: false,
    },
);
</script>

<template>
    <Tooltip v-if="content && !disabled">
        <TooltipTrigger as-child>
            <slot />
        </TooltipTrigger>
        <TooltipContent :side="side">
            {{ content }}
        </TooltipContent>
    </Tooltip>
    <slot v-else />
</template>
