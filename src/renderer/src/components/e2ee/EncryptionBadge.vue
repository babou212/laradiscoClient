<script setup lang="ts">
import { Lock } from 'lucide-vue-next';
import { Tooltip, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

defineProps<{
    decryptError?: boolean;
}>();
</script>

<template>
    <TooltipProvider>
        <Tooltip>
            <TooltipTrigger as-child>
                <span class="inline-flex items-center">
                    <Lock :size="12" :class="['shrink-0', decryptError ? 'text-destructive' : 'text-green-500']" />
                </span>
            </TooltipTrigger>
        </Tooltip>
    </TooltipProvider>
</template>
