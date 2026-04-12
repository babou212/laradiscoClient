<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

interface Props {
    typingUsers: Map<number, { username: string; timeout: ReturnType<typeof setTimeout> }>;
}

const props = defineProps<Props>();

const { t } = useI18n();

const typingUserNames = computed(() => {
    const names = Array.from(props.typingUsers.values()).map((u) => u.username);
    if (names.length === 0) return '';
    if (names.length === 1) return t('chat.typing.one', { user: names[0] });
    return t('chat.typing.several');
});
</script>

<template>
    <div v-if="typingUserNames" class="text-muted-foreground px-4 pb-1 text-xs">
        <span class="inline-flex items-center gap-1">
            <span class="flex gap-0.5">
                <span
                    class="bg-muted-foreground inline-block size-1.5 animate-bounce rounded-full"
                    style="animation-delay: 0ms"
                />
                <span
                    class="bg-muted-foreground inline-block size-1.5 animate-bounce rounded-full"
                    style="animation-delay: 150ms"
                />
                <span
                    class="bg-muted-foreground inline-block size-1.5 animate-bounce rounded-full"
                    style="animation-delay: 300ms"
                />
            </span>
            {{ typingUserNames }}
        </span>
    </div>
</template>
