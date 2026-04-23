<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { useAppearance, isDarkTheme } from '@/composables/useAppearance';

const EmojiPicker = defineAsyncComponent(async () => {
    // @ts-expect-error — side-effect CSS import has no types
    await import('vue3-emoji-picker/css');
    return (await import('vue3-emoji-picker')).default;
});

interface Emits {
    (e: 'select', emoji: string): void;
}

const emit = defineEmits<Emits>();
const { theme } = useAppearance();

const pickerTheme = computed(() => (isDarkTheme(theme.value) ? 'dark' : 'light'));

const onSelect = (emoji: { i: string }) => {
    emit('select', emoji.i);
};
</script>

<template>
    <div class="emoji-picker-wrapper">
        <EmojiPicker :native="true" :theme="pickerTheme" :display-recent="true" @select="onSelect" />
    </div>
</template>

<style scoped>
.emoji-picker-wrapper {
    border-radius: 0.5rem;
    overflow: hidden;
    box-shadow:
        0 10px 15px -3px rgb(0 0 0 / 0.1),
        0 4px 6px -4px rgb(0 0 0 / 0.1);
}

.emoji-picker-wrapper :deep(.v3-emoji-picker) {
    --v3-picker-bg: var(--popover);
    --v3-picker-fg: var(--popover-foreground);
    --v3-picker-border: var(--border);
    --v3-picker-input-bg: var(--input);
    --v3-picker-input-border: var(--border);
    --v3-picker-input-focus-border: var(--ring);
    --v3-picker-emoji-hover: var(--accent);
}
</style>
