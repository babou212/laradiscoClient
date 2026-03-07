<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useChatStore } from '@/stores/chat';
import { usePresenceStore } from '@/stores/presence';
import ChannelSidebar from '@/components/chat/ChannelSidebar.vue';
import MessagesPanel from '@/components/chat/MessagesPanel.vue';
import OnlineUsersSidebar from '@/components/chat/OnlineUsersSidebar.vue';

const route = useRoute();
const router = useRouter();
const chatStore = useChatStore();
const presenceStore = usePresenceStore();

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
        <ChannelSidebar
            :categories="chatStore.categories"
            :direct-messages="[]"
            :selected-channel-id="chatStore.selectedChannelId ?? undefined"
            :server-name="chatStore.serverName"
            @select-channel="handleSelectChannel"
            @switch-to-dms="handleSwitchToDms"
        />

        <MessagesPanel
            :channel="chatStore.currentChannel ?? undefined"
            :channel-permissions="chatStore.currentChannelPermissions ?? undefined"
        />

        <OnlineUsersSidebar />
    </div>
</template>
