<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { OTPInput } from 'vue-input-otp';
import { cn } from '@/lib/utils';

const props = withDefaults(
    defineProps<{
        modelValue?: string;
        maxlength?: number;
        disabled?: boolean;
        class?: HTMLAttributes['class'];
    }>(),
    {
        maxlength: 6,
    },
);

const emit = defineEmits<{
    'update:modelValue': [value: string | undefined];
    complete: [value: string];
}>();
</script>

<template>
    <OTPInput
        :maxlength="props.maxlength"
        :model-value="modelValue"
        inputmode="numeric"
        :disabled="disabled"
        :container-class="cn('flex items-center gap-2 has-[:disabled]:opacity-50', props.class)"
        @update:model-value="emit('update:modelValue', $event)"
        @complete="emit('complete', $event)"
    >
        <template #default="{ slots, isFocused }">
            <div class="flex items-center gap-2">
                <div
                    v-for="(slot, idx) in slots"
                    :key="idx"
                    :class="
                        cn(
                            'border-input dark:bg-input/30 relative flex h-12 w-10 items-center justify-center rounded-md border bg-transparent text-lg font-medium shadow-xs transition-all',
                            'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
                            isFocused && slot.isActive && 'border-ring ring-ring/50 z-10 ring-[3px]',
                        )
                    "
                >
                    <span v-if="slot.char">{{ slot.char }}</span>
                    <span v-else-if="slot.placeholderChar" class="text-muted-foreground">
                        {{ slot.placeholderChar }}
                    </span>
                    <div
                        v-if="slot.hasFakeCaret"
                        class="pointer-events-none absolute inset-0 flex items-center justify-center"
                    >
                        <div class="bg-foreground h-5 w-px animate-pulse duration-1000" />
                    </div>
                </div>
            </div>
        </template>
    </OTPInput>
</template>
