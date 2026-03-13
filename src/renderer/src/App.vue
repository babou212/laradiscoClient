<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { RouterView } from 'vue-router';
import NotificationToast from '@/components/NotificationToast.vue';
import TitleBar from '@/components/TitleBar.vue';
import { usePresenceStore } from '@/stores/presence';

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
    <TitleBar />
    <div class="h-[calc(100vh-var(--titlebar-height))] overflow-hidden">
        <RouterView />
    </div>
    <NotificationToast />
</template>
