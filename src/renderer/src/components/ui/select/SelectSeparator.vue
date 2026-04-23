<script setup lang="ts">
import type { SelectSeparatorProps } from 'reka-ui';
import { SelectSeparator } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<SelectSeparatorProps & { class?: HTMLAttributes['class'] }>();
</script>

<template>
    <SelectSeparator :class="cn('bg-muted -mx-1 my-1 h-px', props.class)">
        <slot />
    </SelectSeparator>
</template>
