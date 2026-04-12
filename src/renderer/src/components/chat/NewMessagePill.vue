<script setup lang="ts">
import { ArrowDown } from 'lucide-vue-next';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

interface Props {
    count: number;
    viewingHistory?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    viewingHistory: false,
});

defineEmits<{
    click: [];
}>();

const { t } = useI18n();

const label = computed(() => {
    if (props.viewingHistory) return t('chat.newMessagePill.jumpToPresent');
    if (props.count === 0) return t('chat.newMessagePill.jumpToBottom');
    return t('chat.newMessagePill.newMessages', { count: props.count }, props.count);
});
</script>

<template>
    <button
        type="button"
        class="bg-primary text-primary-foreground hover:bg-primary/90 pointer-events-auto flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium shadow-lg transition-transform hover:scale-105"
        @click="$emit('click')"
    >
        <ArrowDown class="size-3.5" />
        {{ label }}
    </button>
</template>
