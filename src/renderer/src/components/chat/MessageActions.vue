<script setup lang="ts">
import { CornerDownRight, MessageSquareText, Pencil, Pin, PinOff, SmilePlus, Trash2 } from 'lucide-vue-next';
import EmojiPicker from './EmojiPicker.vue';

defineProps<{
    canReact: boolean;
    canReply: boolean;
    canThread: boolean;
    canPin: boolean;
    canEdit: boolean;
    canDelete: boolean;
    isPinned: boolean;
    showEmojiPicker: boolean;
    emojiPickerPosition: 'above' | 'below';
}>();

const emit = defineEmits<{
    toggleReaction: [emoji: string];
    reply: [];
    openThread: [];
    togglePin: [];
    startEdit: [];
    delete: [];
    toggleEmojiPicker: [];
}>();
</script>

<template>
    <div
        class="border-border bg-background absolute -top-3 right-2 hidden gap-0.5 rounded border p-0.5 shadow-sm group-hover:flex"
    >
        <button
            v-if="canReact"
            data-reaction-button
            class="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
            title="Add reaction"
            @click.stop="emit('toggleEmojiPicker')"
        >
            <SmilePlus :size="16" />
        </button>
        <button
            v-if="canReply"
            class="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
            title="Reply"
            @click="emit('reply')"
        >
            <CornerDownRight :size="16" />
        </button>
        <button
            v-if="canThread"
            class="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
            title="Reply in Thread"
            @click="emit('openThread')"
        >
            <MessageSquareText :size="16" />
        </button>
        <button
            v-if="canPin"
            class="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
            :title="isPinned ? 'Unpin message' : 'Pin message'"
            @click="emit('togglePin')"
        >
            <PinOff v-if="isPinned" :size="16" />
            <Pin v-else :size="16" />
        </button>
        <button
            v-if="canEdit"
            class="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
            title="Edit message"
            @click="emit('startEdit')"
        >
            <Pencil :size="16" />
        </button>
        <button
            v-if="canDelete"
            class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded p-1 transition-colors"
            title="Delete message"
            @click="emit('delete')"
        >
            <Trash2 :size="16" />
        </button>
    </div>

    <EmojiPicker
        v-if="showEmojiPicker"
        class="emoji-picker-container absolute right-20 z-10"
        :class="emojiPickerPosition === 'above' ? 'bottom-full mb-1' : 'top-8'"
        @select="emit('toggleReaction', $event)"
    />
</template>
