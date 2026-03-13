<script setup lang="ts">
import { computed } from 'vue';
import { Lock } from 'lucide-vue-next';
import { Badge } from '@/components/ui/badge';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

const props = defineProps<{
    isEncrypted?: boolean;
    decryptError?: boolean;
}>();

</script>

<template>
    <TooltipProvider v-if="isEncrypted">
        <Tooltip>
            <TooltipTrigger as-child>
                <span class="inline-flex items-center">
                    <Lock
                        :size="12"
                        :class="[
                            'shrink-0',
                            decryptError ? 'text-destructive' : 'text-green-500',
                        ]"
                    />
                </span>
            </TooltipTrigger>
        </Tooltip>
    </TooltipProvider>
</template>
