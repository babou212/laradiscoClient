<script setup lang="ts">
import { ChevronDown, ChevronRight } from 'lucide-vue-next';
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import UserProfilePanel from './UserProfilePanel.vue';
import { useAuthStore } from '@/stores/auth';
import { useDirectMessagesStore } from '@/stores/directMessages';
import { usePresenceStore } from '@/stores/presence';
import type { UserStatusType } from '@/types';

const presenceStore = usePresenceStore();
const authStore = useAuthStore();
const dmStore = useDirectMessagesStore();
const router = useRouter();

const selectedUser = ref<any>(null);
const showUserProfile = ref(false);

const currentUserId = computed(() => authStore.user?.id);

const collapsedSections = reactive(new Set<string>());

const toggleSection = (section: string) => {
    if (collapsedSections.has(section)) {
        collapsedSections.delete(section);
    } else {
        collapsedSections.add(section);
    }
};

const usersByStatus = computed(() => {
    const online = presenceStore.allMembers.filter((u) => u.status === 'online');
    const idle = presenceStore.allMembers.filter((u) => u.status === 'idle');
    const dnd = presenceStore.allMembers.filter((u) => u.status === 'dnd');
    const offline = presenceStore.allMembers.filter((u) => u.status === 'offline');

    return { online, idle, dnd, offline };
});

const getStatusColor = (status?: UserStatusType) => {
    switch (status) {
        case 'online':
            return 'bg-green-500';
        case 'idle':
            return 'bg-orange-500';
        case 'dnd':
            return 'bg-red-500';
        case 'offline':
        default:
            return 'bg-gray-400';
    }
};

const openUserProfile = (user: any) => {
    selectedUser.value = user;
    showUserProfile.value = true;
};

const closeUserProfile = () => {
    showUserProfile.value = false;
    selectedUser.value = null;
};

const startDm = async (userId: number) => {
    closeUserProfile();
    try {
        const groupId = await dmStore.startOrGetDm(userId);
        if (groupId) {
            router.push({ name: 'direct-messages', params: { threadId: groupId } });
        }
    } catch (error) {
        console.error('Failed to start DM:', error);
    }
};

const statusSections = computed(() => {
    const sections: Array<{
        key: string;
        label: string;
        users: any[];
        opacity?: string;
    }> = [];

    if (usersByStatus.value.online.length > 0) {
        sections.push({
            key: 'online',
            label: `Online — ${usersByStatus.value.online.length}`,
            users: usersByStatus.value.online,
        });
    }
    if (usersByStatus.value.idle.length > 0) {
        sections.push({
            key: 'idle',
            label: `Idle — ${usersByStatus.value.idle.length}`,
            users: usersByStatus.value.idle,
        });
    }
    if (usersByStatus.value.dnd.length > 0) {
        sections.push({
            key: 'dnd',
            label: `Do Not Disturb — ${usersByStatus.value.dnd.length}`,
            users: usersByStatus.value.dnd,
        });
    }
    if (usersByStatus.value.offline.length > 0) {
        sections.push({
            key: 'offline',
            label: `Offline — ${usersByStatus.value.offline.length}`,
            users: usersByStatus.value.offline,
            opacity: 'opacity-60 hover:opacity-100',
        });
    }

    return sections;
});
</script>

<template>
    <div class="border-border bg-sidebar flex h-full w-60 flex-col border-l">
        <div class="flex-1 overflow-y-auto px-2 py-4">
            <div v-for="section in statusSections" :key="section.key" class="mb-2">
                <button
                    type="button"
                    class="text-sidebar-foreground/70 hover:text-sidebar-foreground flex w-full items-center gap-1 px-2 py-1 text-xs font-semibold tracking-wide uppercase"
                    @click="toggleSection(section.key)"
                >
                    <ChevronRight v-if="collapsedSections.has(section.key)" :size="12" class="transition-transform" />
                    <ChevronDown v-else :size="12" class="transition-transform" />
                    {{ section.label }}
                </button>
                <div v-if="!collapsedSections.has(section.key)" class="mt-1 space-y-0.5">
                    <button
                        v-for="user in section.users"
                        :key="user.id"
                        type="button"
                        class="group hover:bg-sidebar-accent flex w-full cursor-pointer items-center gap-x-2 rounded px-2 py-1 text-left transition-colors"
                        :class="section.opacity"
                        @click="openUserProfile(user)"
                    >
                        <div class="relative">
                            <div
                                class="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                            >
                                {{ user.display_name?.[0]?.toUpperCase() || 'U' }}
                            </div>
                            <div
                                class="border-sidebar absolute right-0 bottom-0 size-2.5 rounded-full border-2"
                                :class="getStatusColor(user.status)"
                            />
                        </div>
                        <div class="min-w-0 flex-1">
                            <div class="text-sidebar-foreground truncate text-sm font-medium">
                                {{ user.display_name }}
                            </div>
                            <div v-if="user.custom_status" class="text-sidebar-foreground/60 truncate text-xs">
                                {{ user.custom_status }}
                            </div>
                        </div>
                    </button>
                </div>
            </div>
        </div>

        <UserProfilePanel
            v-if="selectedUser && showUserProfile"
            :user="selectedUser"
            :show="showUserProfile"
            :is-current-user="selectedUser.id === currentUserId"
            @close="closeUserProfile"
            @send-message="startDm"
        />
    </div>
</template>
