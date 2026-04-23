<script setup lang="ts">
import { ref, onUnmounted } from 'vue';

type Props = {
    direction: 'left' | 'right';
};

const props = defineProps<Props>();
const emit = defineEmits<{ resize: [delta: number] }>();

const isDragging = ref(false);
let startX = 0;

const onMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    isDragging.value = true;
    startX = e.clientX;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
};

const onMouseMove = (e: MouseEvent) => {
    const delta = e.clientX - startX;
    startX = e.clientX;
    const adjustedDelta = props.direction === 'left' ? -delta : delta;
    emit('resize', adjustedDelta);
};

const onMouseUp = () => {
    isDragging.value = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
};

onUnmounted(() => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
});
</script>

<template>
    <div
        class="resize-handle group relative z-10 flex w-1 shrink-0 cursor-col-resize items-center justify-center"
        :class="{ 'is-dragging': isDragging }"
        @mousedown="onMouseDown"
    >
        <div
            class="bg-border group-hover:bg-primary/50 h-full w-px transition-colors"
            :class="{ 'bg-primary/50': isDragging }"
        />
    </div>
</template>
