<script setup lang="ts">
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatMessageDate } from '@/lib/utils';
import { useAvatarStore } from '@/stores/avatar';
import { useUserNamesStore } from '@/stores/userNames';
import type { ThreadPreview } from '@/types/chat';

interface Props {
    thread: ThreadPreview;
}

defineProps<Props>();

defineEmits<{
    openThread: [];
}>();

const avatarStore = useAvatarStore();
const userNamesStore = useUserNamesStore();
</script>

<template>
    <button
        class="mt-1 flex items-center gap-1.5 rounded py-1 text-left transition-colors hover:bg-accent/40"
        @click="$emit('openThread')"
    >
        <Avatar v-if="thread.last_reply?.user" class="size-5 shrink-0">
            <AvatarImage
                v-if="avatarStore.getAvatarUrl(thread.last_reply.user.id, 'thumb')"
                :src="avatarStore.getAvatarUrl(thread.last_reply.user.id, 'thumb')!"
                :alt="thread.last_reply.user.username"
            />
            <AvatarFallback class="bg-primary text-primary-foreground text-[10px] font-semibold">
                {{
                    userNamesStore
                        .getDisplayName(thread.last_reply.user.id, thread.last_reply.user.username)[0]
                        .toUpperCase()
                }}
            </AvatarFallback>
        </Avatar>
        <span class="text-primary text-xs font-semibold hover:underline">
            {{ thread.message_count }} {{ thread.message_count === 1 ? 'reply' : 'replies' }}
        </span>
        <span v-if="thread.last_message_at" class="text-muted-foreground text-xs">
            Last reply {{ formatMessageDate(thread.last_message_at) }}
        </span>
    </button>
</template>
