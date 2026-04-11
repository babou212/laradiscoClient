<script setup lang="ts">
import { ArrowDown } from 'lucide-vue-next';
import { computed } from 'vue';

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

const label = computed(() => {
    if (props.viewingHistory) return 'Jump to present';
    if (props.count === 0) return 'Jump to bottom';
    if (props.count === 1) return '1 new message';
    return `${props.count} new messages`;
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
