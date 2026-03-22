<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ChannelSidebar from '@/components/chat/ChannelSidebar.vue';
import MessagesPanel from '@/components/chat/MessagesPanel.vue';
import OnlineUsersSidebar from '@/components/chat/OnlineUsersSidebar.vue';
import ResizeHandle from '@/components/ui/ResizeHandle.vue';
import { useChatStore } from '@/stores/chat';
import { usePresenceStore } from '@/stores/presence';

const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
const presenceStore = usePresenceStore();

const USERS_MIN = 180;
const USERS_MAX = 400;
const USERS_DEFAULT = 240;

const usersWidth = ref(USERS_DEFAULT);
const usersCollapsed = ref(false);

const onUsersResize = (delta: number) => {
    usersWidth.value = Math.min(USERS_MAX, Math.max(USERS_MIN, usersWidth.value + delta));
};

const toggleUsersCollapsed = () => {
    usersCollapsed.value = !usersCollapsed.value;
};

onMounted(async () => {
    await chatStore.fetchCategories();
    await presenceStore.fetchMembers();

    const channelId = Number(route.params.channelId);
    if (channelId) {
        await chatStore.selectChannel(channelId);
    }
});

watch(
    () => route.params.channelId,
    async (newId) => {
        const id = Number(newId);
        if (id) {
            await chatStore.selectChannel(id);
        }
    },
);

const handleSelectChannel = (channelId: number) => {
    router.push({ name: 'chat', params: { channelId } });
};

const handleSwitchToDms = () => {
    router.push({ name: 'direct-messages' });
};
</script>

<template>
    <div class="flex h-full w-full overflow-hidden">
        <div class="w-60 shrink-0">
            <ChannelSidebar
                :categories="chatStore.categories"
                :direct-messages="[]"
                :selected-channel-id="chatStore.selectedChannelId ?? undefined"
                :server-name="chatStore.serverName"
                @select-channel="handleSelectChannel"
                @switch-to-dms="handleSwitchToDms"
            />
        </div>

        <div class="flex min-w-0 flex-1 flex-col">
            <MessagesPanel
                :channel="chatStore.currentChannel ?? undefined"
                :channel-permissions="chatStore.currentChannelPermissions ?? undefined"
                :users-collapsed="usersCollapsed"
                @toggle-users-collapsed="toggleUsersCollapsed"
            />
        </div>

        <ResizeHandle v-if="!usersCollapsed" direction="left" @resize="onUsersResize" />

        <div v-if="!usersCollapsed" class="shrink-0" :style="{ width: usersWidth + 'px' }">
            <OnlineUsersSidebar />
        </div>
    </div>
</template>
