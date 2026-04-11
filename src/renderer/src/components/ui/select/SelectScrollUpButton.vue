<script setup lang="ts">
import { ChevronUp } from 'lucide-vue-next';
import type { SelectScrollUpButtonProps } from 'reka-ui';
import { SelectScrollUpButton } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<SelectScrollUpButtonProps & { class?: HTMLAttributes['class'] }>();
</script>

<template>
    <SelectScrollUpButton :class="cn('flex cursor-default items-center justify-center py-1', props.class)">
        <slot>
            <ChevronUp class="size-4" />
        </slot>
    </SelectScrollUpButton>
</template>
