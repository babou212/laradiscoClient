<script setup lang="ts">
import { useEventListener } from '@vueuse/core';
import { CornerDownRight, Paperclip, Send, Smile, X } from 'lucide-vue-next';
import { computed, nextTick, ref, shallowRef, useTemplateRef } from 'vue';
import EmojiPicker from './EmojiPicker.vue';
import GifPicker from './GifPicker.vue';
import MentionDropdown from './MentionDropdown.vue';
import {
    FileAddSchema,
    GifUrlSchema,
    MAX_FILES,
    MAX_MESSAGE_LENGTH,
    MentionValueSchema,
    MessageSendSchema,
} from '@/lib/message-schemas';
import type { StagedFile, UploadingFile } from '@/lib/message-schemas';
import type { MessageData } from '@/types/chat';

export type { StagedFile, UploadingFile };

interface Props {
    channelName?: string;
    placeholder?: string;
    replyingTo?: MessageData | null;
    disabled?: boolean;
    canAttachFiles?: boolean;
    uploadingFiles?: UploadingFile[];
}

const emit = defineEmits<{
    send: [content: string, files: StagedFile[]];
    typing: [];
    cancelReply: [];
}>();

const messageInput = shallowRef('');
const showEmojiPicker = shallowRef(false);
const showGifPicker = shallowRef(false);
const showMentionDropdown = shallowRef(false);
const mentionQuery = shallowRef('');
const mentionStartIndex = shallowRef(-1);
const textareaRef = useTemplateRef<HTMLTextAreaElement>('textareaRef');
const emojiPickerRef = useTemplateRef<HTMLElement>('emojiPickerRef');
const gifPickerRef = useTemplateRef<HTMLElement>('gifPickerRef');
const fileInputRef = useTemplateRef<HTMLInputElement>('fileInputRef');
const stagedFiles = ref<StagedFile[]>([]);
const fileSizeError = shallowRef<string | null>(null);
let fileSizeErrorTimer: ReturnType<typeof setTimeout> | undefined;

const props = defineProps<Props>();

const replyPreviewContent = computed(() => {
    if (!props.replyingTo) return '';
    return props.replyingTo.decrypted_content ?? '[Encrypted message]';
});

const charCount = computed(() => messageInput.value.length);
const isOverLimit = computed(() => charCount.value > MAX_MESSAGE_LENGTH);
const isMessageValid = computed(
    () =>
        !props.disabled &&
        !isOverLimit.value &&
        MessageSendSchema.safeParse({ content: messageInput.value, files: stagedFiles.value }).success,
);

const sendMessage = () => {
    if (props.disabled) return;
    const result = MessageSendSchema.safeParse({ content: messageInput.value, files: stagedFiles.value });
    if (!result.success) return;
    emit('send', messageInput.value, [...stagedFiles.value]);
    messageInput.value = '';
    stagedFiles.value = [];
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
        if (isMessageValid.value) sendMessage();
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
    if (!MentionValueSchema.safeParse(value).success) return;

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

const onSelectGif = (gifUrl: string) => {
    if (!GifUrlSchema.safeParse(gifUrl).success) return;
    messageInput.value = gifUrl;
    showGifPicker.value = false;
    sendMessage();
};

function addFiles(files: FileList | File[]) {
    const rejected: string[] = [];
    for (const file of Array.from(files)) {
        if (stagedFiles.value.length >= MAX_FILES) break;
        const fileResult = FileAddSchema.safeParse(file);
        if (!fileResult.success) {
            rejected.push(fileResult.error.issues[0]?.message ?? file.name);
            continue;
        }

        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const staged: StagedFile = { file, id };

        if (file.type.startsWith('image/')) {
            staged.preview = URL.createObjectURL(file);
        } else if (file.type.startsWith('video/')) {
            file.arrayBuffer()
                .then((buf) => {
                    const fileData = new Uint8Array(buf);
                    return window.api.attachments.generateVideoThumbnail({
                        fileData,
                        mimeType: file.type,
                    });
                })
                .then((result) => {
                    if (result) staged.preview = result.dataUrl;
                })
                .catch(() => {
                    // Ignore - video will just show without a preview
                });
        }

        stagedFiles.value.push(staged);
    }

    if (rejected.length > 0) {
        fileSizeError.value =
            rejected.length === 1
                ? rejected[0]
                : `${rejected.length} files exceed the 100 MB limit: ${rejected.join(', ')}`;
        clearTimeout(fileSizeErrorTimer);
        fileSizeErrorTimer = setTimeout(() => {
            fileSizeError.value = null;
        }, 5000);
    }
}

function removeFile(id: string) {
    const idx = stagedFiles.value.findIndex((f) => f.id === id);
    if (idx !== -1) {
        const removed = stagedFiles.value.splice(idx, 1)[0];
        if (removed.preview) URL.revokeObjectURL(removed.preview);
    }
}

function onFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (input.files) addFiles(input.files);
    input.value = '';
}

function onDrop(e: DragEvent) {
    e.preventDefault();
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
}

function onDragOver(e: DragEvent) {
    e.preventDefault();
}

function triggerFileInput() {
    fileInputRef.value?.click();
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

useEventListener(document, 'click', handleClickOutside);
</script>

<template>
    <div class="px-4 pb-4" @drop="onDrop" @dragover="onDragOver">
        <input ref="fileInputRef" type="file" multiple class="hidden" @change="onFileSelect" />

        <div
            v-if="fileSizeError"
            class="border-destructive/30 bg-destructive/10 text-destructive mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
        >
            <span class="flex-1">{{ fileSizeError }}</span>
            <button class="hover:bg-destructive/20 shrink-0 rounded px-2 py-0.5 text-xs" @click="fileSizeError = null">
                Dismiss
            </button>
        </div>

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
                class="border-input bg-background focus-within:ring-ring flex flex-col rounded-3xl border shadow-lg focus-within:ring-2"
            >
                <!-- Staged files preview -->
                <div v-if="stagedFiles.length > 0" class="flex flex-wrap gap-2 px-4 pt-3 pb-1">
                    <div
                        v-for="staged in stagedFiles"
                        :key="staged.id"
                        class="bg-muted group relative flex items-center gap-2 rounded-lg px-3 py-2"
                    >
                        <img v-if="staged.preview" :src="staged.preview" class="h-10 w-10 rounded object-cover" />
                        <div v-else class="bg-accent flex h-10 w-10 items-center justify-center rounded text-xs">
                            {{ staged.file.name.split('.').pop()?.toUpperCase() }}
                        </div>
                        <div class="max-w-[120px]">
                            <div class="text-foreground truncate text-xs font-medium">{{ staged.file.name }}</div>
                            <div class="text-muted-foreground text-[10px]">{{ formatFileSize(staged.file.size) }}</div>
                        </div>
                        <button
                            class="text-muted-foreground hover:text-foreground absolute -top-1.5 -right-1.5 rounded-full bg-red-500/80 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                            @click="removeFile(staged.id)"
                        >
                            <X :size="12" />
                        </button>
                    </div>
                </div>

                <!-- Upload progress -->
                <div
                    v-if="props.uploadingFiles && props.uploadingFiles.length > 0"
                    class="flex flex-col gap-2 px-4 pt-3 pb-1"
                >
                    <div
                        v-for="uf in props.uploadingFiles"
                        :key="uf.id"
                        class="bg-muted flex items-center gap-2 rounded-lg px-3 py-2"
                    >
                        <img v-if="uf.preview" :src="uf.preview" class="h-8 w-8 rounded object-cover" />
                        <div
                            v-else
                            class="bg-accent flex h-8 w-8 shrink-0 items-center justify-center rounded text-[10px]"
                        >
                            {{ uf.name.split('.').pop()?.toUpperCase() }}
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center justify-between gap-2">
                                <span class="text-foreground truncate text-xs font-medium">{{ uf.name }}</span>
                                <span class="text-muted-foreground shrink-0 text-[10px]">
                                    {{
                                        uf.status === 'preparing'
                                            ? 'Preparing…'
                                            : uf.status === 'encrypting'
                                              ? 'Encrypting…'
                                              : uf.status === 'finishing'
                                                ? 'Finishing…'
                                                : `${uf.progress}%`
                                    }}
                                </span>
                            </div>
                            <div class="bg-accent mt-1 h-1.5 w-full overflow-hidden rounded-full">
                                <div
                                    class="bg-primary h-full rounded-full transition-[width] duration-200 ease-out"
                                    :style="{ width: `${uf.progress}%` }"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div class="flex items-end gap-2 px-4 py-2">
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
                        v-if="canAttachFiles !== false"
                        type="button"
                        title="Attach file"
                        class="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 rounded p-1.5 transition-colors"
                        @click="triggerFileInput"
                    >
                        <Paperclip :size="18" />
                    </button>
                    <div class="flex flex-1 flex-col">
                        <textarea
                            ref="textareaRef"
                            v-model="messageInput"
                            data-message-input
                            rows="1"
                            class="placeholder:text-muted-foreground w-full resize-none bg-transparent py-1.5 text-sm outline-none"
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
                        <div
                            v-if="charCount >= MAX_MESSAGE_LENGTH * 0.9"
                            class="pb-0.5 text-right text-[10px] leading-none"
                            :class="isOverLimit ? 'text-destructive font-medium' : 'text-muted-foreground'"
                        >
                            {{ charCount }}/{{ MAX_MESSAGE_LENGTH }}
                        </div>
                    </div>
                    <button
                        type="button"
                        class="text-muted-foreground hover:bg-accent hover:text-foreground shrink-0 rounded p-1.5 transition-colors disabled:opacity-50"
                        :disabled="!isMessageValid"
                        @click="sendMessage"
                    >
                        <Send :size="18" />
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
