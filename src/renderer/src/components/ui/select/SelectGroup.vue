<script setup lang="ts">
import type { SelectGroupProps } from 'reka-ui';
import { SelectGroup } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<SelectGroupProps & { class?: HTMLAttributes['class'] }>();
</script>

<template>
    <SelectGroup :class="cn('p-1', props.class)">
        <slot />
    </SelectGroup>
</template>
