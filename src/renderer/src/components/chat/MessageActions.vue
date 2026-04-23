<script setup lang="ts">
import { CornerDownRight, MessageSquareText, Pencil, Pin, PinOff, SmilePlus, Trash2 } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import EmojiPicker from './EmojiPicker.vue';
import { SimpleTooltip } from '@/components/ui/tooltip';

const { t } = useI18n();

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
        <SimpleTooltip v-if="canReact" :content="t('chat.messageActions.addReaction')">
            <button
                data-reaction-button
                class="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
                @click.stop="emit('toggleEmojiPicker')"
            >
                <SmilePlus :size="16" />
            </button>
        </SimpleTooltip>
        <SimpleTooltip v-if="canReply" :content="t('chat.messageActions.reply')">
            <button
                class="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
                @click="emit('reply')"
            >
                <CornerDownRight :size="16" />
            </button>
        </SimpleTooltip>
        <SimpleTooltip v-if="canThread" :content="t('chat.messageActions.replyInThread')">
            <button
                class="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
                @click="emit('openThread')"
            >
                <MessageSquareText :size="16" />
            </button>
        </SimpleTooltip>
        <SimpleTooltip
            v-if="canPin"
            :content="isPinned ? t('chat.messageActions.unpinMessage') : t('chat.messageActions.pinMessage')"
        >
            <button
                class="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
                @click="emit('togglePin')"
            >
                <PinOff v-if="isPinned" :size="16" />
                <Pin v-else :size="16" />
            </button>
        </SimpleTooltip>
        <SimpleTooltip v-if="canEdit" :content="t('chat.messageActions.editMessage')">
            <button
                class="text-muted-foreground hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
                @click="emit('startEdit')"
            >
                <Pencil :size="16" />
            </button>
        </SimpleTooltip>
        <SimpleTooltip v-if="canDelete" :content="t('chat.messageActions.deleteMessage')">
            <button
                class="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded p-1 transition-colors"
                @click="emit('delete')"
            >
                <Trash2 :size="16" />
            </button>
        </SimpleTooltip>
    </div>

    <EmojiPicker
        v-if="showEmojiPicker"
        class="emoji-picker-container absolute right-20 z-10"
        :class="emojiPickerPosition === 'above' ? 'bottom-full mb-1' : 'top-8'"
        @select="emit('toggleReaction', $event)"
    />
</template>
