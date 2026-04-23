import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed } from 'vue';
import { useUsersStore } from './users';
import { getPresence, sendHeartbeat, updatePresence } from '@/api/presence';
import type { OnlineUser, UserStatusType } from '@/types';

const HEARTBEAT_INTERVAL_MS = 60_000;
const SYNC_INTERVAL_MS = 120_000;

export const usePresenceStore = defineStore('presence', () => {
    const usersStore = useUsersStore();
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let syncTimer: ReturnType<typeof setInterval> | null = null;
    let connected = false;
    let visibilityBound = false;

    const onlineUsers = computed<OnlineUser[]>(() =>
        usersStore.onlineMembers.map((u) => ({
            id: u.id,
            username: u.username,
            display_name: u.display_name,
            avatar_urls: u.avatar_urls,
            custom_status: u.custom_status,
            status: u.status,
        })),
    );

    const allMembers = computed<OnlineUser[]>(() =>
        usersStore.members.map((u) => ({
            id: u.id,
            username: u.username,
            display_name: u.display_name,
            avatar_urls: u.avatar_urls,
            custom_status: u.custom_status,
            status: u.status,
        })),
    );

    const fetchOnlineUsers = async () => {
        try {
            const presence = await getPresence();
            usersStore.applyPresenceBatch(presence?.data ?? []);
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

    const startTimers = () => {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (syncTimer) clearInterval(syncTimer);
        heartbeatTimer = setInterval(sendHeartbeatFn, HEARTBEAT_INTERVAL_MS);
        syncTimer = setInterval(fetchOnlineUsers, SYNC_INTERVAL_MS);
    };

    const stopTimers = () => {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
        if (syncTimer) {
            clearInterval(syncTimer);
            syncTimer = null;
        }
    };

    const handleVisibilityChange = () => {
        if (!connected) return;
        if (document.visibilityState === 'hidden') {
            stopTimers();
        } else {
            void fetchOnlineUsers();
            startTimers();
        }
    };

    const connect = async () => {
        if (connected) return;
        connected = true;

        try {
            await updatePresence({ status: 'online' });
        } catch (error) {
            console.error(error);
        }

        await fetchOnlineUsers();
        startTimers();

        if (!visibilityBound) {
            document.addEventListener('visibilitychange', handleVisibilityChange);
            visibilityBound = true;
        }
    };

    const disconnect = () => {
        connected = false;
        stopTimers();
        if (visibilityBound) {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            visibilityBound = false;
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
        const user = usersStore.get(userId);
        if (!user) return undefined;
        return {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            avatar_urls: user.avatar_urls,
            custom_status: user.custom_status,
            status: user.status,
        };
    };

    const updateUserStatus = (userId: string, status: UserStatusType, customStatus: string | null = null) => {
        usersStore.upsert({ id: userId, status, custom_status: customStatus });
    };

    function $reset(): void {
        disconnect();
    }

    return {
        onlineUsers,
        allMembers,
        connect,
        disconnect,
        goOffline,
        fetchOnlineUsers,
        getUserStatus,
        updateUserStatus,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(usePresenceStore, import.meta.hot));
}
