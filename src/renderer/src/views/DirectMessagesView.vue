<script setup lang="ts">
import { MessageSquare } from 'lucide-vue-next';
import { computed, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DirectMessagesSidebar from '@/components/chat/DirectMessagesSidebar.vue';
import MessagesPanel from '@/components/chat/MessagesPanel.vue';
import { useDirectMessagesStore } from '@/stores/directMessages';
import { usePresenceStore } from '@/stores/presence';

const route = useRoute();
const router = useRouter();
const dmStore = useDirectMessagesStore();
const presenceStore = usePresenceStore();

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
    await presenceStore.fetchMembers();

    const threadId = Number(route.params.threadId);
    if (threadId) {
        await dmStore.selectDmGroup(threadId);
    }
});

watch(
    () => route.params.threadId,
    async (newId) => {
        const id = Number(newId);
        if (id) {
            await dmStore.selectDmGroup(id);
        } else {
            dmStore.clearCurrentDm();
        }
    },
);

const handleSelectDm = (dmGroupId: number) => {
    router.push({ name: 'direct-messages', params: { threadId: dmGroupId } });
};

const handleSwitchToChannels = () => {
    router.push({ name: 'home' });
};

const handleStartDm = async (userId: number) => {
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

        <MessagesPanel
            v-if="dmStore.currentDmGroup"
            :channel="channelForPanel"
            :is-dm="true"
        />

        <div
            v-else
            class="flex flex-1 flex-col items-center justify-center bg-background text-center"
        >
            <div class="text-muted-foreground">
                <MessageSquare :size="48" class="mx-auto mb-3 opacity-40" />
                <p class="text-lg font-semibold">Your Direct Messages</p>
                <p class="mt-1 text-sm">
                    Select a conversation or start a new one.
                </p>
            </div>
        </div>
    </div>
</template>
