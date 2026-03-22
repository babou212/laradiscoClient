<script setup lang="ts">
import { MessageSquareText } from 'lucide-vue-next';
import type { ThreadPreview } from '@/types/chat';

interface Props {
    thread: ThreadPreview;
}

defineProps<Props>();

defineEmits<{
    openThread: [];
}>();
</script>

<template>
    <button
        class="border-primary/20 bg-primary/5 hover:bg-primary/10 mt-1.5 inline-flex h-9 w-28 items-center gap-2 rounded-lg border px-2.5 text-left transition-colors"
        @click="$emit('openThread')"
    >
        <MessageSquareText :size="14" class="text-primary shrink-0" />
        <span class="text-primary shrink-0 text-xs font-medium whitespace-nowrap">
            {{ thread.message_count }} {{ thread.message_count === 1 ? 'reply' : 'replies' }}
        </span>
    </button>
</template>
