<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import ChannelSidebar from '@/components/chat/ChannelSidebar.vue';
import MessagesPanel from '@/components/chat/MessagesPanel.vue';
import OnlineUsersSidebar from '@/components/chat/OnlineUsersSidebar.vue';
import ThreadPanel from '@/components/chat/ThreadPanel.vue';
import ResizeHandle from '@/components/ui/ResizeHandle.vue';
import { useChatStore } from '@/stores/chat';
import { useThreadStore } from '@/stores/thread';
import { useVoiceStore } from '@/stores/voice';

const router = useRouter();
const chatStore = useChatStore();
const threadStore = useThreadStore();
const voiceStore = useVoiceStore();

const usersCollapsed = ref(false);

const toggleUsersCollapsed = () => {
    usersCollapsed.value = !usersCollapsed.value;
};

const THREAD_MAX = 600;
const THREAD_DEFAULT = 384;
const threadWidth = ref(THREAD_DEFAULT);

const onThreadResize = (delta: number) => {
    threadWidth.value = Math.min(THREAD_MAX, Math.max(THREAD_DEFAULT, threadWidth.value + delta));
};

onMounted(async () => {
    await chatStore.fetchCategories();
    voiceStore.fetchVoiceParticipants();
    await voiceStore.loadSettings();
    voiceStore.initPttListeners();

    const voiceChannelIds = chatStore.categories
        .flatMap((cat) => cat.channels)
        .filter((ch) => ch.type === 'voice')
        .map((ch) => ch.id);
    voiceStore.subscribeToVoiceChannels(voiceChannelIds);

    if (!chatStore.currentChannel) {
        const firstChannel = chatStore.categories.flatMap((cat) => cat.channels).find((ch) => ch.type === 'text');
        if (firstChannel) {
            await chatStore.selectChannel(firstChannel.id);
        }
    }
});

onUnmounted(() => {
    voiceStore.cleanupPttListeners();
    voiceStore.unsubscribeFromVoiceChannels();
});

const handleSelectChannel = async (channelId: number) => {
    await chatStore.selectChannel(channelId);
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
                v-if="chatStore.currentChannel"
                :channel="chatStore.currentChannel"
                :channel-permissions="chatStore.currentChannelPermissions ?? undefined"
                :users-collapsed="usersCollapsed"
                @toggle-users-collapsed="toggleUsersCollapsed"
            />

            <div v-else class="bg-background flex flex-1 flex-col items-center justify-center text-center">
                <div class="text-muted-foreground">
                    <p class="text-2xl font-bold">Welcome to {{ chatStore.serverName }}</p>
                    <p class="mt-2 text-sm">Select a channel from the sidebar to start chatting.</p>
                </div>
            </div>
        </div>

        <ResizeHandle
            v-if="threadStore.parentMessage && chatStore.currentChannel"
            direction="left"
            @resize="onThreadResize"
        />

        <div
            v-if="threadStore.parentMessage && chatStore.currentChannel"
            class="shrink-0"
            :style="{ width: threadWidth + 'px' }"
        >
            <ThreadPanel
                :channel-id="chatStore.currentChannel.id"
                :channel-permissions="chatStore.currentChannelPermissions ?? undefined"
                @close="threadStore.closeThread()"
            />
        </div>

        <div v-if="!usersCollapsed" class="w-60 shrink-0">
            <OnlineUsersSidebar />
        </div>
    </div>
</template>
