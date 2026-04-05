import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useAvatarStore } from './avatar';
import { useUserNamesStore } from './userNames';
import { getMembers } from '@/api/members';
import { getPresence, sendHeartbeat, updatePresence } from '@/api/presence';
import { getEcho } from '@/lib/echo';
import type { OnlineUser, PresenceUpdate, UserStatusType } from '@/types';

const HEARTBEAT_INTERVAL_MS = 60_000;
const SYNC_INTERVAL_MS = 120_000;

export const usePresenceStore = defineStore('presence', () => {
    const onlineUsers = ref<OnlineUser[]>([]);
    const serverMembers = ref<OnlineUser[]>([]);
    let channel: ReturnType<ReturnType<typeof getEcho>['private']> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let syncTimer: ReturnType<typeof setInterval> | null = null;

    const allMembers = computed<OnlineUser[]>(() => {
        const memberIds = new Set(serverMembers.value.map((m) => m.id));

        const merged = serverMembers.value.map((member) => {
            const liveUser = onlineUsers.value.find((u) => u.id === member.id);

            if (liveUser) {
                return {
                    ...member,
                    status: liveUser.status || 'online',
                    custom_status: liveUser.custom_status ?? member.custom_status,
                };
            }

            return { ...member, status: 'offline' as UserStatusType };
        });

        const extraOnline = onlineUsers.value
            .filter((u) => !memberIds.has(u.id))
            .map((u) => ({
                ...u,
                status: u.status || ('online' as UserStatusType),
            }));

        return [...merged, ...extraOnline];
    });

    const fetchMembers = async () => {
        try {
            const response = await getMembers();
            const members: OnlineUser[] = response.data.map((r) => ({
                id: r.id,
                username: r.attributes.username,
                display_name: r.attributes.display_name ?? r.attributes.username,
                avatar_urls: r.attributes.avatar_urls ?? null,
                custom_status: r.attributes.custom_status ?? null,
            }));
            serverMembers.value = members;
            const avatarStore = useAvatarStore();
            avatarStore.hydrateFromUsers(members);
            const userNamesStore = useUserNamesStore();
            userNamesStore.hydrateFromUsers(members);
        } catch (error) {
            console.error(error);
        }
    };

    const fetchOnlineUsers = async () => {
        try {
            const presenceData = await getPresence();
            const users: OnlineUser[] = presenceData?.data ?? [];
            onlineUsers.value = users.map((u) => ({
                ...u,
                id: String(u.id),
                status: u.status || 'online',
            }));
        } catch (error) {
            console.error(error);
        }
    };

    const sendHeartbeatFn = async () => {
        try {
            await sendHeartbeat();
        } catch (error) {
            console.error(error);
        }
    };

    const applyPresenceUpdate = (data: PresenceUpdate) => {
        const userId = String(data.user_id);
        const idx = onlineUsers.value.findIndex((u) => u.id === userId);

        if (data.status === 'offline') {
            if (idx !== -1) {
                onlineUsers.value.splice(idx, 1);
            }
        } else if (idx !== -1) {
            onlineUsers.value[idx].status = data.status;
            onlineUsers.value[idx].custom_status = data.custom_status;
        } else {
            onlineUsers.value.push({
                id: userId,
                username: data.username,
                display_name: data.display_name ?? data.username,
                avatar_urls: data.avatar_urls ?? null,
                status: data.status,
                custom_status: data.custom_status,
            });
        }
    };

    const connect = async () => {
        if (channel) return;

        await fetchMembers();

        try {
            const echo = getEcho();
            channel = echo.private('presence');
            channel.listen('.user.presence.updated', applyPresenceUpdate);
        } catch (error) {
            console.error('Failed to connect to presence channel:', error);
        }

        try {
            await updatePresence({ status: 'online' });
        } catch (error) {
            console.error(error);
        }

        await fetchOnlineUsers();

        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (syncTimer) clearInterval(syncTimer);
        heartbeatTimer = setInterval(sendHeartbeatFn, HEARTBEAT_INTERVAL_MS);
        syncTimer = setInterval(fetchOnlineUsers, SYNC_INTERVAL_MS);
    };

    const disconnect = () => {
        if (channel) {
            try {
                const echo = getEcho();
                echo.leave('presence');
            } catch (error) {
                console.error(error);
            }
            channel = null;
        }
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
        if (syncTimer) {
            clearInterval(syncTimer);
            syncTimer = null;
        }
    };

    const goOffline = () => {
        try {
            updatePresence({ status: 'offline' }).catch(() => {});
        } catch (error) {
            console.error(error);
        }
    };

    const getUserStatus = (userId: string): OnlineUser | undefined => {
        return allMembers.value.find((u) => u.id === userId);
    };

    const updateUserStatus = (userId: string, status: UserStatusType, customStatus: string | null = null) => {
        const user = onlineUsers.value.find((u) => u.id === userId);
        if (user) {
            user.status = status;
            user.custom_status = customStatus;
        }
    };

    function $reset(): void {
        disconnect();
        onlineUsers.value = [];
        serverMembers.value = [];
    }

    return {
        onlineUsers,
        serverMembers,
        allMembers,
        connect,
        disconnect,
        goOffline,
        fetchMembers,
        fetchOnlineUsers,
        getUserStatus,
        updateUserStatus,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(usePresenceStore, import.meta.hot));
}
