<script setup lang="ts">
import { CornerDownRight } from 'lucide-vue-next';
import { computed } from 'vue';
import { Skeleton } from '@/components/ui/skeleton';
import { formatReplyPreview } from '@/lib/replyPreviewText';
import type { LinkPreviewData } from '@/types/chat';

const props = defineProps<{
    username: string;
    isDecrypting: boolean;
    content: string;
    linkPreview?: LinkPreviewData | null;
}>();

const preview = computed(() => formatReplyPreview(props.content, props.linkPreview));
</script>

<template>
    <div class="border-primary/50 bg-accent/30 mt-1 flex items-start gap-1.5 rounded border-l-2 px-2 py-1.5 text-xs">
        <CornerDownRight :size="14" class="text-muted-foreground mt-0.5 shrink-0" />
        <div class="min-w-0 flex-1">
            <span class="text-primary font-medium">{{ username }}</span>
            <Skeleton v-if="isDecrypting" class="h-3 w-40" />
            <span v-else class="text-muted-foreground block truncate">{{ preview }}</span>
        </div>
    </div>
</template>
