<script setup lang="ts">
import { computed } from 'vue';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useInitials } from '@/composables/useInitials';
import type { AuthUser } from '@/stores/auth';
import { useAvatarStore } from '@/stores/avatar';
import { useUserNamesStore } from '@/stores/userNames';

type Props = {
    user: AuthUser;
    showEmail?: boolean;
};

const props = withDefaults(defineProps<Props>(), {
    showEmail: false,
});

const { getInitials } = useInitials();
const avatarStore = useAvatarStore();
const userNamesStore = useUserNamesStore();

const avatarUrl = computed(() => avatarStore.getAvatarUrl(props.user.id, 'thumb'));
const resolvedName = computed(() => userNamesStore.getDisplayName(props.user.id, props.user.name));
</script>

<template>
    <Avatar class="h-8 w-8 overflow-hidden rounded-lg">
        <AvatarImage v-if="avatarUrl" :src="avatarUrl" :alt="resolvedName" />
        <AvatarFallback class="rounded-lg text-black dark:text-white">
            {{ getInitials(resolvedName) }}
        </AvatarFallback>
    </Avatar>

    <div class="grid flex-1 text-left text-sm leading-tight">
        <span class="truncate font-medium">{{ resolvedName }}</span>
        <span v-if="showEmail" class="text-muted-foreground truncate text-xs">{{ user.email }}</span>
    </div>
</template>
