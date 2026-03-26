<script setup lang="ts">
import { CodeXml, CornerDownRight, Send, Smile, X } from 'lucide-vue-next';
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import EmojiPicker from './EmojiPicker.vue';
import GifPicker from './GifPicker.vue';
import MentionDropdown from './MentionDropdown.vue';
import type { MessageData } from '@/types/chat';

interface Props {
    channelName?: string;
    placeholder?: string;
    replyingTo?: MessageData | null;
    disabled?: boolean;
}

interface Emits {
    (e: 'send', content: string): void;
    (e: 'typing'): void;
    (e: 'cancelReply'): void;
}

const emit = defineEmits<Emits>();

const messageInput = ref('');
const showEmojiPicker = ref(false);
const showGifPicker = ref(false);
const showMentionDropdown = ref(false);
const mentionQuery = ref('');
const mentionStartIndex = ref(-1);
const textareaRef = ref<HTMLTextAreaElement>();
const emojiPickerRef = ref<HTMLElement>();
const gifPickerRef = ref<HTMLElement>();

const props = defineProps<Props>();

const replyPreviewContent = computed(() => {
    if (!props.replyingTo) return '';
    return props.replyingTo.decrypted_content ?? '[Encrypted message]';
});

const sendMessage = () => {
    if (!messageInput.value.trim() || props.disabled) return;
    emit('send', messageInput.value);
    messageInput.value = '';
    showMentionDropdown.value = false;
    nextTick(adjustTextareaHeight);
};

const handleKeydown = (e: KeyboardEvent) => {
    if (showMentionDropdown.value) {
        if (['ArrowDown', 'ArrowUp', 'Tab', 'Escape'].includes(e.key)) {
            return;
        }
        if (e.key === 'Enter') {
            return;
        }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
};

const detectMention = () => {
    const textarea = textareaRef.value;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = messageInput.value.slice(0, cursorPos);

    const mentionMatch = textBeforeCursor.match(/(?:^|\s)@(\w*)$/);

    if (mentionMatch) {
        const query = mentionMatch[1];
        mentionQuery.value = query;
        mentionStartIndex.value = cursorPos - query.length - 1;
        showMentionDropdown.value = true;
    } else {
        showMentionDropdown.value = false;
        mentionQuery.value = '';
        mentionStartIndex.value = -1;
    }
};

const onMentionSelect = (value: string) => {
    if (mentionStartIndex.value < 0) return;

    const before = messageInput.value.slice(0, mentionStartIndex.value);
    const cursorPos = textareaRef.value?.selectionStart || messageInput.value.length;
    const after = messageInput.value.slice(cursorPos);

    const prefix = before.length > 0 && !before.endsWith(' ') ? before : before;
    messageInput.value = `${prefix}@${value} ${after}`;
    showMentionDropdown.value = false;
    mentionQuery.value = '';
    mentionStartIndex.value = -1;

    setTimeout(() => {
        const newPos = prefix.length + value.length + 2;
        textareaRef.value?.focus();
        textareaRef.value?.setSelectionRange(newPos, newPos);
    }, 0);
};

const adjustTextareaHeight = () => {
    const textarea = textareaRef.value;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
};

const handleInput = () => {
    emit('typing');
    detectMention();
    adjustTextareaHeight();
};

const onSelectEmoji = (emoji: string) => {
    const cursorPos = textareaRef.value?.selectionStart || messageInput.value.length;
    messageInput.value = messageInput.value.slice(0, cursorPos) + emoji + messageInput.value.slice(cursorPos);
    showEmojiPicker.value = false;

    setTimeout(() => {
        textareaRef.value?.focus();
        const newPos = cursorPos + emoji.length;
        textareaRef.value?.setSelectionRange(newPos, newPos);
        adjustTextareaHeight();
    }, 0);
};

const insertCodeBlock = () => {
    const textarea = textareaRef.value;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = messageInput.value.slice(start, end);
    const before = messageInput.value.slice(0, start);
    const after = messageInput.value.slice(end);
    messageInput.value = `${before}\`\`\`\n${selected}\n\`\`\`${after}`;
    nextTick(() => {
        textarea.focus();
        if (selected) {
            textarea.setSelectionRange(start + 4, start + 4 + selected.length);
        } else {
            const pos = start + 4;
            textarea.setSelectionRange(pos, pos);
        }
        adjustTextareaHeight();
    });
};

const onSelectGif = (gifUrl: string) => {
    messageInput.value = gifUrl;
    showGifPicker.value = false;
    sendMessage();
};

const handleClickOutside = (e: MouseEvent) => {
    if (showEmojiPicker.value && emojiPickerRef.value && !emojiPickerRef.value.contains(e.target as Node)) {
        const emojiButton = (e.target as HTMLElement).closest('[data-emoji-button]');
        if (!emojiButton) {
            showEmojiPicker.value = false;
        }
    }
    if (showGifPicker.value && gifPickerRef.value && !gifPickerRef.value.contains(e.target as Node)) {
        const gifButton = (e.target as HTMLElement).closest('[data-gif-button]');
        if (!gifButton) {
            showGifPicker.value = false;
        }
    }
};

onMounted(() => {
    document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside);
});
</script>

<template>
    <div class="px-4 pb-4">
        <div
            v-if="replyingTo"
            class="border-border bg-accent/30 flex items-start gap-2 rounded-t-2xl border border-b-0 px-4 py-2"
        >
            <CornerDownRight :size="16" class="text-muted-foreground mt-1 shrink-0" />
            <div class="min-w-0 flex-1">
                <div class="text-primary text-xs font-medium">Replying to {{ replyingTo.user.username }}</div>
                <div class="text-muted-foreground truncate text-xs">
                    {{ replyPreviewContent.substring(0, 100) }}{{ replyPreviewContent.length > 100 ? '...' : '' }}
                </div>
            </div>
            <button
                class="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 rounded p-1"
                @click="emit('cancelReply')"
            >
                <X :size="16" />
            </button>
        </div>

        <div class="relative">
            <MentionDropdown
                :query="mentionQuery"
                :visible="showMentionDropdown"
                @select="onMentionSelect"
                @close="showMentionDropdown = false"
            />

            <div v-if="showEmojiPicker" ref="emojiPickerRef" class="absolute bottom-full left-4 z-10 mb-2">
                <EmojiPicker @select="onSelectEmoji" />
            </div>

            <div v-if="showGifPicker" ref="gifPickerRef" class="absolute bottom-full left-4 z-10 mb-2">
                <GifPicker @select="onSelectGif" />
            </div>

            <div
                class="border-input bg-background focus-within:ring-ring flex items-end gap-2 rounded-3xl border px-4 py-2 shadow-lg focus-within:ring-2"
            >
                <button
                    type="button"
                    data-emoji-button
                    class="shrink-0 rounded p-1.5 transition-colors"
                    :class="
                        showEmojiPicker
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    "
                    @click="
                        showEmojiPicker = !showEmojiPicker;
                        showGifPicker = false;
                    "
                >
                    <Smile :size="18" />
                </button>
                <button
                    type="button"
                    data-gif-button
                    class="shrink-0 rounded p-1.5 transition-colors"
                    :class="
                        showGifPicker
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    "
                    @click="
                        showGifPicker = !showGifPicker;
                        showEmojiPicker = false;
                    "
                >
                    <span class="text-[11px] leading-none font-extrabold">GIF</span>
                </button>
                <button
                    type="button"
                    title="Insert code block"
                    class="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 rounded p-1.5 transition-colors"
                    @click="insertCodeBlock"
                >
                    <CodeXml :size="18" />
                </button>
                <textarea
                    ref="textareaRef"
                    v-model="messageInput"
                    rows="1"
                    class="placeholder:text-muted-foreground flex-1 resize-none bg-transparent py-1.5 text-sm outline-none"
                    :class="{ 'cursor-not-allowed opacity-50': props.disabled }"
                    :placeholder="
                        props.disabled
                            ? 'Sending too fast — please wait…'
                            : props.placeholder || `Message #${channelName || 'channel'}`
                    "
                    :disabled="props.disabled"
                    @keydown="handleKeydown"
                    @input="handleInput"
                />
                <button
                    type="button"
                    class="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 rounded p-1.5 transition-colors disabled:opacity-50"
                    :disabled="!messageInput.trim() || props.disabled"
                    @click="sendMessage"
                >
                    <Send :size="18" />
                </button>
            </div>
        </div>
    </div>
</template>
