<script setup lang="ts">
import { useEventListener } from '@vueuse/core';
import { Pin, PinOff, X } from 'lucide-vue-next';
import { onMounted, useTemplateRef } from 'vue';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { renderMarkdownWithMentions } from '@/lib/markdown';
import { formatMessageDate } from '@/lib/utils';
import { useAvatarStore } from '@/stores/avatar';
import { useUserNamesStore } from '@/stores/userNames';
import type { MessageData } from '@/types/chat';

const avatarStore = useAvatarStore();
const userNamesStore = useUserNamesStore();

type Props = {
    pinnedMessages: MessageData[];
    isLoading: boolean;
    canUnpin?: boolean;
};

defineProps<Props>();

const emit = defineEmits<{
    close: [];
    unpin: [messageId: string];
    jump: [messageId: string];
}>();

const panelRef = useTemplateRef<HTMLElement>('panelRef');

let ready = false;
onMounted(() =>
    requestAnimationFrame(() => {
        ready = true;
    }),
);

useEventListener(document, 'pointerdown', (event: PointerEvent) => {
    if (!ready) return;
    if (panelRef.value && !panelRef.value.contains(event.target as Node)) {
        emit('close');
    }
});

const displayContent = (message: MessageData): string => {
    if (message.decrypt_error) return '[Unable to decrypt this message]';
    return message.decrypted_content ?? '';
};

const renderedContent = (message: MessageData): string => {
    return renderMarkdownWithMentions(displayContent(message));
};
</script>

<template>
    <div
        ref="panelRef"
        class="border-border bg-popover text-popover-foreground absolute top-full right-0 z-30 mt-1 flex w-80 flex-col rounded-lg border shadow-lg"
    >
        <div class="border-border flex items-center justify-between border-b px-3 py-2">
            <div class="flex items-center gap-1.5">
                <Pin :size="14" class="text-primary" />
                <span class="text-sm font-semibold">Pinned Messages</span>
            </div>
            <button
                class="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-0.5 transition-colors"
                @click="emit('close')"
            >
                <X :size="14" />
            </button>
        </div>

        <div class="max-h-80 overflow-y-auto p-2">
            <div v-if="isLoading" class="space-y-3 p-2">
                <div v-for="i in 3" :key="i" class="flex gap-2">
                    <Skeleton class="size-6 rounded-full" />
                    <div class="flex-1 space-y-1">
                        <Skeleton class="h-3 w-24" />
                        <Skeleton class="h-3 w-3/4" />
                    </div>
                </div>
            </div>

            <div v-else-if="pinnedMessages.length === 0" class="py-6 text-center">
                <div class="text-muted-foreground">
                    <Pin :size="32" class="mx-auto mb-1.5 opacity-50" />
                    <p class="text-xs">No pinned messages yet.</p>
                </div>
            </div>

            <div v-else class="space-y-1">
                <div
                    v-for="message in pinnedMessages"
                    :key="message.id"
                    class="hover:bg-accent/50 group relative cursor-pointer rounded-md p-2 transition-colors"
                    @click="emit('jump', message.id)"
                >
                    <div class="flex items-start gap-2">
                        <Avatar v-if="message.user" class="size-6 shrink-0">
                            <AvatarImage
                                v-if="avatarStore.getAvatarUrl(message.user.id, 'thumb')"
                                :src="avatarStore.getAvatarUrl(message.user.id, 'thumb')!"
                                :alt="message.user.username"
                            />
                            <AvatarFallback class="bg-primary text-primary-foreground text-[10px] font-semibold">
                                {{ userNamesStore.getDisplayName(message.user.id, message.user.username)[0].toUpperCase() }}
                            </AvatarFallback>
                        </Avatar>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-baseline gap-1.5">
                                <span class="text-xs font-semibold">{{ userNamesStore.getDisplayName(message.user.id, message.user.username) }}</span>
                                <span class="text-muted-foreground text-[10px]">
                                    {{ formatMessageDate(message.created_at) }}
                                </span>
                            </div>
                            <div class="prose-chat mt-0.5 text-xs wrap-break-word" v-html="renderedContent(message)" />
                        </div>
                        <button
                            v-if="canUnpin"
                            class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive hidden shrink-0 rounded p-0.5 transition-colors group-hover:block"
                            title="Unpin message"
                            @click.stop="emit('unpin', message.id)"
                        >
                            <PinOff :size="14" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
