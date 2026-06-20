<script setup lang="ts">
import { useNow } from '@vueuse/core';
import { AppWindow, Gamepad2, Music } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { UserActivity } from '@/types/user';

const props = defineProps<{ activity: UserActivity }>();

const { t } = useI18n();

// Ticks once a second so the elapsed timer stays live while the card is open.
const now = useNow({ interval: 1000 });

const imgFailed = ref(false);
watch(
    () => props.activity.icon,
    () => (imgFailed.value = false),
);

const fallbackIcon = computed(() => {
    switch (props.activity.type) {
        case 'music':
            return Music;
        case 'app':
            return AppWindow;
        default:
            return Gamepad2;
    }
});

const verb = computed(() => t(`chat.userProfile.activity.${props.activity.type}`));

const elapsed = computed(() => {
    const seconds = Math.max(0, Math.floor(now.value.getTime() / 1000) - props.activity.started_at);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const duration = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m` : `${s}s`;
    return t('chat.userProfile.activity.elapsed', { duration });
});

const showImage = computed(() => Boolean(props.activity.icon) && !imgFailed.value);
</script>

<template>
    <div class="bg-background/50 rounded-lg p-3">
        <div class="flex items-center gap-3">
            <div class="bg-muted flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md">
                <img
                    v-if="showImage"
                    :src="activity.icon!"
                    :alt="activity.name"
                    class="size-full object-cover"
                    @error="imgFailed = true"
                />
                <component :is="fallbackIcon" v-else class="text-muted-foreground size-6" />
            </div>
            <div class="min-w-0 flex-1">
                <p class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{{ verb }}</p>
                <p class="text-popover-foreground truncate text-sm font-medium">{{ activity.name }}</p>
                <p v-if="activity.details" class="text-muted-foreground truncate text-xs">{{ activity.details }}</p>
                <p class="text-muted-foreground mt-0.5 text-xs">{{ elapsed }}</p>
            </div>
        </div>
    </div>
</template>
