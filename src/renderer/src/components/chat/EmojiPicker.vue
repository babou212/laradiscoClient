<script setup lang="ts">
import { ref } from 'vue';

interface Emits {
    (e: 'select', emoji: string): void;
}

const emit = defineEmits<Emits>();

const searchQuery = ref('');

const emojiCategories = [
    {
        name: 'Smileys',
        emojis: [
            '😀',
            '😃',
            '😄',
            '😁',
            '😆',
            '😅',
            '🤣',
            '😂',
            '🙂',
            '😉',
            '😊',
            '😇',
            '🥰',
            '😍',
            '🤩',
            '😘',
            '😗',
            '😚',
            '😋',
            '😛',
            '😜',
            '🤪',
            '😝',
            '🤑',
            '🤗',
            '🤭',
            '🤫',
            '🤔',
            '🤐',
            '🤨',
            '😐',
            '😑',
            '😶',
            '😏',
            '😒',
            '🙄',
            '😬',
            '🤥',
            '😌',
            '😔',
            '😪',
            '🤤',
            '😴',
            '😷',
            '🤒',
            '🤕',
            '🤢',
            '🤮',
            '🥵',
            '🥶',
            '🥴',
            '😵',
            '🤯',
            '🤠',
            '🥳',
            '😎',
            '🤓',
            '🧐',
            '😕',
            '😟',
            '🙁',
            '😮',
            '😯',
            '😲',
            '😳',
            '🥺',
            '😦',
            '😧',
            '😨',
            '😰',
            '😥',
            '😢',
            '😭',
            '😱',
            '😖',
            '😣',
            '😞',
            '😓',
            '😩',
            '😫',
            '🥱',
            '😤',
            '😡',
            '😠',
            '🤬',
        ],
    },
    {
        name: 'Gestures',
        emojis: [
            '👍',
            '👎',
            '👊',
            '✊',
            '🤛',
            '🤜',
            '👏',
            '🙌',
            '👐',
            '🤲',
            '🤝',
            '🙏',
            '✌️',
            '🤞',
            '🤟',
            '🤘',
            '👌',
            '🤌',
            '🤏',
            '👈',
            '👉',
            '👆',
            '👇',
            '☝️',
            '✋',
            '🤚',
            '🖐️',
            '🖖',
            '👋',
            '🤙',
            '💪',
            '🦾',
            '🖕',
        ],
    },
    {
        name: 'Hearts',
        emojis: [
            '❤️',
            '🧡',
            '💛',
            '💚',
            '💙',
            '💜',
            '🖤',
            '🤍',
            '🤎',
            '💔',
            '❣️',
            '💕',
            '💞',
            '💓',
            '💗',
            '💖',
            '💘',
            '💝',
            '💟',
        ],
    },
    {
        name: 'Objects',
        emojis: [
            '🔥',
            '⭐',
            '🌟',
            '✨',
            '💫',
            '🎉',
            '🎊',
            '🎈',
            '🎁',
            '🏆',
            '🥇',
            '🥈',
            '🥉',
            '⚽',
            '🏀',
            '🎮',
            '🎵',
            '🎶',
            '☕',
            '🍕',
            '🍔',
            '🍟',
            '🌮',
            '🍩',
            '🍰',
            '🍫',
            '🍿',
            '🥤',
        ],
    },
];

const filteredEmojis = () => {
    if (!searchQuery.value) return emojiCategories;
    return emojiCategories
        .map((cat) => ({
            ...cat,
            emojis: cat.emojis.filter(() => cat.name.toLowerCase().includes(searchQuery.value.toLowerCase())),
        }))
        .filter((cat) => cat.emojis.length > 0);
};

const selectEmoji = (emoji: string) => {
    emit('select', emoji);
};
</script>

<template>
    <div
        class="border-border bg-background flex h-[350px] w-[320px] flex-col overflow-hidden rounded-lg border shadow-lg"
    >
        <div class="border-border border-b p-2">
            <input
                v-model="searchQuery"
                type="text"
                placeholder="Search emoji..."
                class="border-input bg-background focus:ring-ring w-full rounded-md border px-3 py-1.5 text-sm outline-none focus:ring-2"
            />
        </div>

        <div class="flex-1 overflow-y-auto p-2">
            <div v-for="category in filteredEmojis()" :key="category.name" class="mb-3">
                <div class="text-muted-foreground mb-1 text-xs font-semibold">
                    {{ category.name }}
                </div>
                <div class="flex flex-wrap gap-1">
                    <button
                        v-for="emoji in category.emojis"
                        :key="emoji"
                        type="button"
                        class="hover:bg-accent flex size-8 items-center justify-center rounded text-lg transition-colors"
                        @click="selectEmoji(emoji)"
                    >
                        {{ emoji }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
