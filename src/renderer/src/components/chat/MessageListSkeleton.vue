<script setup lang="ts">
import { computed } from 'vue';
import { Skeleton } from '@/components/ui/skeleton';

const props = withDefaults(defineProps<{ rows?: number }>(), {
    rows: 16,
});

// Deterministic, varied line widths so the placeholder reads like real
// conversation rather than identical bars. Indexed by row to stay stable
// across re-renders.
const widths = ['62%', '85%', '45%', '73%', '38%', '90%', '55%', '68%', '50%', '80%'];

const rowItems = computed(() =>
    Array.from({ length: props.rows }, (_, i) => ({
        id: i,
        nameWidth: `${Math.round(((i * 37) % 60) + 25)}px`,
        lineWidth: widths[i % widths.length],
        // Roughly every third row gets a second line for visual rhythm.
        twoLines: i % 3 === 1,
        secondLineWidth: widths[(i + 3) % widths.length],
    })),
);
</script>

<template>
    <div class="flex h-full flex-col justify-end gap-1 overflow-hidden px-4 pt-4 pb-4" aria-hidden="true">
        <div v-for="row in rowItems" :key="row.id" class="flex gap-3 rounded p-2">
            <Skeleton class="size-10 shrink-0 rounded-full" />
            <div class="min-w-0 flex-1 space-y-2 py-1">
                <div class="flex items-center gap-2">
                    <Skeleton class="h-3.5 rounded" :style="{ width: row.nameWidth }" />
                    <Skeleton class="h-3 w-10 rounded opacity-70" />
                </div>
                <Skeleton class="h-3.5 rounded" :style="{ width: row.lineWidth }" />
                <Skeleton v-if="row.twoLines" class="h-3.5 rounded" :style="{ width: row.secondLineWidth }" />
            </div>
        </div>
    </div>
</template>
