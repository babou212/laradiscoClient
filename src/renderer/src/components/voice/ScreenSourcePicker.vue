<script setup lang="ts">
import { Monitor, AppWindow, X } from 'lucide-vue-next';
import { ref, computed, watch } from 'vue';
import { Button } from '@/components/ui/button';

interface ScreenSource {
    id: string;
    name: string;
    thumbnail: string;
    appIcon: string | null;
    display_id: string;
}

const props = defineProps<{
    sources: ScreenSource[];
}>();

const emit = defineEmits<{
    select: [sourceId: string];
    cancel: [];
}>();

const selectedSourceId = ref<string | null>(null);
const activeTab = ref<'screens' | 'windows'>('screens');

const screens = computed(() => props.sources.filter((s) => s.id.startsWith('screen:')));
const windows = computed(() => props.sources.filter((s) => s.id.startsWith('window:')));

const displayedSources = computed(() => (activeTab.value === 'screens' ? screens.value : windows.value));

watch(
    [screens, activeTab],
    () => {
        const current = activeTab.value === 'screens' ? screens.value : windows.value;
        if (!selectedSourceId.value || !current.some((s) => s.id === selectedSourceId.value)) {
            selectedSourceId.value = current[0]?.id ?? null;
        }
    },
    { immediate: true },
);

function confirm() {
    if (selectedSourceId.value) {
        emit('select', selectedSourceId.value);
    }
}
</script>

<template>
    <div class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="fixed inset-0 bg-black/60" @click="emit('cancel')" />

        <div class="bg-card relative z-10 w-full max-w-2xl rounded-lg border shadow-xl">
            <div class="flex items-center justify-between border-b px-6 py-4">
                <h2 class="text-lg font-semibold">Share Your Screen</h2>
                <button
                    type="button"
                    class="text-muted-foreground hover:text-foreground rounded p-1 transition-colors"
                    @click="emit('cancel')"
                >
                    <X :size="18" />
                </button>
            </div>

            <div class="flex gap-1 border-b px-6">
                <button
                    type="button"
                    class="flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors"
                    :class="
                        activeTab === 'screens'
                            ? 'border-primary text-foreground'
                            : 'text-muted-foreground hover:text-foreground border-transparent'
                    "
                    @click="activeTab = 'screens'"
                >
                    <Monitor :size="16" />
                    Screens
                    <span class="bg-muted rounded-full px-1.5 py-0.5 text-xs">{{ screens.length }}</span>
                </button>
                <button
                    type="button"
                    class="flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors"
                    :class="
                        activeTab === 'windows'
                            ? 'border-primary text-foreground'
                            : 'text-muted-foreground hover:text-foreground border-transparent'
                    "
                    @click="activeTab = 'windows'"
                >
                    <AppWindow :size="16" />
                    Windows
                    <span class="bg-muted rounded-full px-1.5 py-0.5 text-xs">{{ windows.length }}</span>
                </button>
            </div>

            <div class="max-h-80 overflow-y-auto p-6">
                <div v-if="sources.length === 0" class="flex items-center justify-center py-12">
                    <span class="text-muted-foreground text-sm">No {{ activeTab }} available</span>
                </div>

                <div v-else class="grid grid-cols-3 gap-3">
                    <button
                        v-for="source in displayedSources"
                        :key="source.id"
                        type="button"
                        class="group flex flex-col overflow-hidden rounded-lg border-2 transition-all"
                        :class="
                            selectedSourceId === source.id
                                ? 'border-primary ring-primary/20 ring-2'
                                : 'border-border hover:border-muted-foreground/40'
                        "
                        @click="selectedSourceId = source.id"
                    >
                        <div class="bg-muted aspect-video w-full overflow-hidden">
                            <img :src="source.thumbnail" :alt="source.name" class="h-full w-full object-cover" />
                        </div>
                        <div class="flex items-center gap-2 px-2 py-1.5">
                            <img
                                v-if="source.appIcon"
                                :src="source.appIcon"
                                class="size-4 shrink-0"
                                :alt="source.name"
                            />
                            <Monitor v-else :size="14" class="text-muted-foreground shrink-0" />
                            <span class="truncate text-xs">{{ source.name }}</span>
                        </div>
                    </button>
                </div>
            </div>

            <div class="flex items-center justify-end gap-3 border-t px-6 py-4">
                <Button variant="outline" size="sm" @click="emit('cancel')">Cancel</Button>
                <Button size="sm" :disabled="!selectedSourceId" @click="confirm">Share</Button>
            </div>
        </div>
    </div>
</template>
