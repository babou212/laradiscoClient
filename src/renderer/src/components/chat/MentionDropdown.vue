<script setup lang="ts">
import { useEventListener } from '@vueuse/core';
import { computed, onUnmounted, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { searchMentions } from '@/api/members';

export interface MentionUser {
    id: number;
    username: string;
    name: string;
    nickname: string | null;
    avatar_urls: { thumb: string; small: string; medium: string; original: string } | null;
}

interface Props {
    query: string;
    visible: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
    select: [value: string];
    close: [];
}>();

const users = shallowRef<MentionUser[]>([]);
const loading = shallowRef(false);
const selectedIndex = shallowRef(0);

const { t } = useI18n();

const specialMentions = computed(() => {
    const items: Array<{ label: string; value: string; description: string }> = [];
    if ('everyone'.startsWith(props.query.toLowerCase()) || props.query === '') {
        items.push({
            label: '@everyone',
            value: 'everyone',
            description: t('chat.mentions.everyoneDescription'),
        });
    }
    if ('here'.startsWith(props.query.toLowerCase()) || props.query === '') {
        items.push({
            label: '@here',
            value: 'here',
            description: t('chat.mentions.hereDescription'),
        });
    }
    return items;
});

const allItems = computed(() => {
    const specials = specialMentions.value.map((s) => ({
        type: 'special' as const,
        ...s,
    }));
    const userItems = users.value.map((u) => ({
        type: 'user' as const,
        label: `@${u.username}`,
        value: u.username,
        description: u.nickname || u.name,
        avatar_urls: u.avatar_urls,
    }));
    return [...specials, ...userItems];
});

let abortController: AbortController | null = null;

const searchUsers = async (query: string) => {
    if (abortController) {
        abortController.abort();
    }

    if (!query || query.length < 1) {
        users.value = [];
        return;
    }

    if (['everyone', 'here'].includes(query.toLowerCase())) {
        users.value = [];
        return;
    }

    loading.value = true;
    abortController = new AbortController();

    try {
        const response = await searchMentions(query, abortController.signal);
        users.value = response.data.map((u) => ({
            id: Number(u.id),
            username: u.attributes.username,
            name: u.attributes.name ?? u.attributes.username,
            nickname: u.attributes.nickname ?? null,
            avatar_urls: u.attributes.avatar_urls ?? null,
        }));
    } catch (err: unknown) {
        if (err instanceof Error && err.name !== 'AbortError') {
            console.error('Mention search failed:', err);
        }
    } finally {
        loading.value = false;
    }
};

watch(
    () => props.query,
    (newQuery) => {
        selectedIndex.value = 0;
        searchUsers(newQuery);
    },
);

watch(
    () => props.visible,
    (isVisible) => {
        if (isVisible) {
            selectedIndex.value = 0;
            searchUsers(props.query);
        }
    },
);

const handleKeydown = (e: KeyboardEvent) => {
    if (!props.visible || allItems.value.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex.value = (selectedIndex.value + 1) % allItems.value.length;
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex.value = (selectedIndex.value - 1 + allItems.value.length) % allItems.value.length;
    } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (allItems.value.length > 0) {
            e.preventDefault();
            const item = allItems.value[selectedIndex.value];
            if (item) {
                emit('select', item.value);
            }
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        emit('close');
    }
};

useEventListener(document, 'keydown', handleKeydown, { capture: true });

onUnmounted(() => {
    if (abortController) {
        abortController.abort();
    }
});
</script>

<template>
    <div
        v-if="visible && allItems.length > 0"
        class="border-border bg-popover absolute bottom-full left-0 z-50 mb-1 w-72 overflow-hidden rounded-lg border shadow-lg"
    >
        <div class="max-h-60 overflow-y-auto p-1">
            <div class="text-muted-foreground px-2 py-1.5 text-xs font-semibold">{{ t('chat.mentions.label') }}</div>

            <button
                v-for="(item, index) in allItems"
                :key="item.value"
                class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
                :class="
                    index === selectedIndex ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/50'
                "
                @mouseenter="selectedIndex = index"
                @click.prevent="emit('select', item.value)"
            >
                <template v-if="item.type === 'special'">
                    <div
                        class="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-full"
                    >
                        @
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="font-medium">{{ item.label }}</div>
                        <div class="text-muted-foreground truncate text-xs">
                            {{ item.description }}
                        </div>
                    </div>
                </template>

                <template v-else>
                    <div
                        class="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    >
                        {{ item.value[0]?.toUpperCase() }}
                    </div>
                    <div class="min-w-0 flex-1">
                        <div class="font-medium">{{ item.label }}</div>
                        <div class="text-muted-foreground truncate text-xs">
                            {{ item.description }}
                        </div>
                    </div>
                </template>
            </button>

            <div v-if="loading" class="text-muted-foreground flex items-center justify-center py-2 text-xs">
                {{ t('chat.mentions.searching') }}
            </div>
        </div>
    </div>
</template>
