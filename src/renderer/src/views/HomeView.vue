<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useChatStore } from '@/stores/chat';
import { useVoiceStore } from '@/stores/voice';
import ChannelSidebar from '@/components/chat/ChannelSidebar.vue';
import MessagesPanel from '@/components/chat/MessagesPanel.vue';
import OnlineUsersSidebar from '@/components/chat/OnlineUsersSidebar.vue';

const router = useRouter();
const chatStore = useChatStore();
const voiceStore = useVoiceStore();

onMounted(async () => {
    await chatStore.fetchCategories();
    voiceStore.fetchVoiceParticipants();
    await voiceStore.loadSettings();
    voiceStore.initPttListeners();
});

onUnmounted(() => {
    voiceStore.cleanupPttListeners();
});

const handleSelectChannel = async (channelId: number) => {
    await chatStore.selectChannel(channelId);
};

const handleSwitchToDms = () => {
    router.push({ name: 'direct-messages' });
};
</script>

<template>
    <div class="flex h-full w-full">
        <ChannelSidebar
            :categories="chatStore.categories"
            :direct-messages="[]"
            :selected-channel-id="chatStore.selectedChannelId ?? undefined"
            :server-name="chatStore.serverName"
            @select-channel="handleSelectChannel"
            @switch-to-dms="handleSwitchToDms"
        />

        <MessagesPanel
            v-if="chatStore.currentChannel"
            :channel="chatStore.currentChannel"
            :channel-permissions="chatStore.currentChannelPermissions ?? undefined"
        />

        <div
            v-else
            class="flex flex-1 flex-col items-center justify-center bg-background text-center"
        >
            <div class="text-muted-foreground">
                <p class="text-2xl font-bold">Welcome to {{ chatStore.serverName }}</p>
                <p class="mt-2 text-sm">Select a channel from the sidebar to start chatting.</p>
            </div>
        </div>

        <OnlineUsersSidebar />
    </div>
</template>
