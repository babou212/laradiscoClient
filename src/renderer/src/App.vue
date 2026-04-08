<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import AppContextMenu from '@/components/AppContextMenu.vue';
import NotificationToast from '@/components/NotificationToast.vue';
import TitleBar from '@/components/TitleBar.vue';
import UpdateToast from '@/components/UpdateToast.vue';
import ScreenShareViewer from '@/components/voice/ScreenShareViewer.vue';
import { usePresenceStore } from '@/stores/presence';

const route = useRoute();
const isSettingsPage = computed(() => route.path.startsWith('/settings'));

const presenceStore = usePresenceStore();

const handleBeforeQuit = () => {
    presenceStore.goOffline();
};

onMounted(() => {
    window.api?.window?.onBeforeQuit(handleBeforeQuit);
});

onUnmounted(() => {
    window.api?.window?.removeBeforeQuitListener();
});
</script>

<template>
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
</template>
