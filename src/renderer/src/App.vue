<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import AdminActionDialogs from '@/components/chat/AdminActionDialogs.vue';
import ChannelActionDialogs from '@/components/chat/ChannelActionDialogs.vue';
import AppContextMenu from '@/components/AppContextMenu.vue';
import NotificationToast from '@/components/NotificationToast.vue';
import TitleBar from '@/components/TitleBar.vue';
import { TooltipProvider } from '@/components/ui/tooltip';
import UpdateToast from '@/components/UpdateToast.vue';
import ScreenShareViewer from '@/components/voice/ScreenShareViewer.vue';
import { usePresenceStore } from '@/stores/presence';
import { useVoiceStore } from '@/stores/voice';

const route = useRoute();
const isSettingsPage = computed(() => route.path.startsWith('/settings'));

const presenceStore = usePresenceStore();
const voiceStore = useVoiceStore();

const handleBeforeQuit = () => {
    presenceStore.goOffline();
    voiceStore.leaveChannel();
};

const suppressMouseNavButtons = (e: MouseEvent) => {
    if (e.button === 3 || e.button === 4) e.preventDefault();
};

onMounted(async () => {
    window.api?.window?.onBeforeQuit(handleBeforeQuit);
    window.addEventListener('mousedown', suppressMouseNavButtons, true);
    window.addEventListener('mouseup', suppressMouseNavButtons, true);
    window.addEventListener('auxclick', suppressMouseNavButtons, true);

    await voiceStore.loadSettings();
    voiceStore.initPttListeners();
});

onUnmounted(() => {
    window.api?.window?.removeBeforeQuitListener();
    window.removeEventListener('mousedown', suppressMouseNavButtons, true);
    window.removeEventListener('mouseup', suppressMouseNavButtons, true);
    window.removeEventListener('auxclick', suppressMouseNavButtons, true);
    voiceStore.cleanupPttListeners();
});
</script>

<template>
    <TooltipProvider :delay-duration="0">
        <AppContextMenu>
            <TitleBar />
            <div class="h-[calc(100vh-var(--titlebar-height))] overflow-hidden">
                <RouterView />
            </div>
            <NotificationToast />
            <UpdateToast />
            <div v-show="!isSettingsPage">
                <ScreenShareViewer />
            </div>
        </AppContextMenu>
        <AdminActionDialogs />
        <ChannelActionDialogs />
    </TooltipProvider>
</template>
