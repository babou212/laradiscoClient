<script setup lang="ts">
import { MessageSquare } from 'lucide-vue-next';
import { computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import DirectMessagesSidebar from '@/components/chat/DirectMessagesSidebar.vue';
import MessagesPanel from '@/components/chat/MessagesPanel.vue';
import { useDirectMessagesStore } from '@/stores/directMessages';
import { useVoiceStore } from '@/stores/voice';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const dmStore = useDirectMessagesStore();
const voiceStore = useVoiceStore();

const showChannelScreenShare = computed(
    () =>
        voiceStore.screenShareViewMode === 'channel' &&
        voiceStore.activeScreenShareView !== null &&
        voiceStore.screenShareParticipants.length > 0,
);

const channelForPanel = computed(() => {
    if (!dmStore.currentDmGroup) return undefined;
    return {
        id: dmStore.currentDmGroup.id,
        name: dmStore.currentDmGroup.name,
        topic: null as string | null,
        other_user: dmStore.currentDmGroup.other_user,
    };
});

onMounted(async () => {
    await dmStore.fetchDmGroups();
    dmStore.decryptLastMessages();

    const threadId = route.params.threadId as string;
    if (threadId) {
        await dmStore.selectDmGroup(threadId);
    }
});

watch(
    () => route.params.threadId,
    async (newId) => {
        const id = newId as string;
        if (id) {
            await dmStore.selectDmGroup(id);
        } else {
            dmStore.clearCurrentDm();
        }
    },
);

const handleSelectDm = (dmGroupId: string) => {
    router.push({ name: 'direct-messages', params: { threadId: dmGroupId } });
};

const handleSwitchToChannels = () => {
    router.push({ name: 'home' });
};

const handleStartDm = async (userId: string) => {
    const groupId = await dmStore.startOrGetDm(userId);
    if (groupId) {
        router.push({ name: 'direct-messages', params: { threadId: groupId } });
    }
};
</script>

<template>
    <div class="flex h-full w-full overflow-hidden">
        <DirectMessagesSidebar
            :dm-groups="dmStore.dmGroups"
            :selected-dm-group-id="dmStore.selectedDmGroupId"
            @select-dm="handleSelectDm"
            @switch-to-channels="handleSwitchToChannels"
            @start-dm="handleStartDm"
        />

        <div v-if="showChannelScreenShare" id="screen-share-channel-target" class="flex min-h-0 flex-1 flex-col" />

        <MessagesPanel v-else-if="dmStore.currentDmGroup" :channel="channelForPanel" :is-dm="true" />

        <div v-else class="bg-background flex flex-1 flex-col items-center justify-center text-center">
            <div class="text-muted-foreground">
                <MessageSquare :size="48" class="mx-auto mb-3 opacity-40" />
                <p class="text-lg font-semibold">{{ t('directMessages.title') }}</p>
                <p class="mt-1 text-sm">{{ t('directMessages.emptyPrompt') }}</p>
            </div>
        </div>
    </div>
</template>
