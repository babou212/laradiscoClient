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
        emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '😎', '🤓', '🧐', '😕', '😟', '🙁', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬'],
    },
    {
        name: 'Gestures',
        emojis: ['👍', '👎', '👊', '✊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✌️', '🤞', '🤟', '🤘', '👌', '🤌', '🤏', '👈', '👉', '👆', '👇', '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤙', '💪', '🦾', '🖕'],
    },
    {
        name: 'Hearts',
        emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'],
    },
    {
        name: 'Objects',
        emojis: ['🔥', '⭐', '🌟', '✨', '💫', '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉', '⚽', '🏀', '🎮', '🎵', '🎶', '☕', '🍕', '🍔', '🍟', '🌮', '🍩', '🍰', '🍫', '🍿', '🥤'],
    },
];

const filteredEmojis = () => {
    if (!searchQuery.value) return emojiCategories;
    return emojiCategories
        .map((cat) => ({
            ...cat,
            emojis: cat.emojis.filter(() =>
                cat.name.toLowerCase().includes(searchQuery.value.toLowerCase()),
            ),
        }))
        .filter((cat) => cat.emojis.length > 0);
};

const selectEmoji = (emoji: string) => {
    emit('select', emoji);
};
</script>

<template>
    <div
        class="flex h-[350px] w-[320px] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg"
    >
        <div class="border-b border-border p-2">
            <input
                v-model="searchQuery"
                type="text"
                placeholder="Search emoji..."
                class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
        </div>

        <div class="flex-1 overflow-y-auto p-2">
            <div
                v-for="category in filteredEmojis()"
                :key="category.name"
                class="mb-3"
            >
                <div
                    class="mb-1 text-xs font-semibold text-muted-foreground"
                >
                    {{ category.name }}
                </div>
                <div class="flex flex-wrap gap-1">
                    <button
                        v-for="emoji in category.emojis"
                        :key="emoji"
                        type="button"
                        class="flex size-8 items-center justify-center rounded text-lg transition-colors hover:bg-accent"
                        @click="selectEmoji(emoji)"
                    >
                        {{ emoji }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
