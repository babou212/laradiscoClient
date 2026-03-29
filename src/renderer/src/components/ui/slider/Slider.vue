<script setup lang="ts">
import { reactiveOmit } from '@vueuse/core';
import type { SliderRootEmits, SliderRootProps } from 'reka-ui';
import { SliderRange, SliderRoot, SliderThumb, SliderTrack, useForwardPropsEmits } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { cn } from '@/lib/utils';

const props = defineProps<SliderRootProps & { class?: HTMLAttributes['class'] }>();
const emits = defineEmits<SliderRootEmits>();

const delegatedProps = reactiveOmit(props, 'class');
const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
    <SliderRoot
        data-slot="slider"
        v-bind="forwarded"
        :class="cn('relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50', props.class)"
    >
        <SliderTrack
            data-slot="slider-track"
            class="bg-muted-foreground/20 relative h-1.5 w-full grow overflow-hidden rounded-full"
        >
            <SliderRange data-slot="slider-range" class="bg-primary absolute h-full" />
        </SliderTrack>
        <SliderThumb
            v-for="(_, i) in (modelValue ?? []).length || 1"
            :key="i"
            data-slot="slider-thumb"
            class="border-primary/50 bg-background focus-visible:ring-ring block size-4 rounded-full border shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none"
        />
    </SliderRoot>
</template>
