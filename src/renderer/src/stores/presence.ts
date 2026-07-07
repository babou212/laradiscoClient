import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed } from 'vue';
import { getPresence, sendHeartbeat, updatePresence } from '@/api/presence';
import type { OnlineUser, UserStatusType } from '@/types';
import { useUsersStore } from './users';

const HEARTBEAT_INTERVAL_MS = 30_000;
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
            activity: u.activity,
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
            activity: u.activity,
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
        // Beat immediately so a resume (reconnect/visibility) re-registers us with
        // the server right away instead of waiting a full interval.
        void sendHeartbeatFn();
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

    // Fire an immediate heartbeat and refresh the roster. Used when connectivity
    // is (re)established — tab becomes visible, the OS network comes back, or the
    // websocket reconnects — so a transient drop that downgraded us to idle is
    // corrected without waiting for the next scheduled beat.
    const reconcile = async () => {
        if (!connected) return;
        await sendHeartbeatFn();
        await fetchOnlineUsers();
    };

    const handleVisibilityChange = () => {
        if (!connected) return;
        // Deliberately keep heartbeats running while hidden so a minimised desktop
        // window stays online. On becoming visible we just reconcile, since the OS
        // may have throttled timers while backgrounded.
        if (document.visibilityState !== 'hidden') {
            void reconcile();
        }
    };

    const handleOnline = () => {
        void reconcile();
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
            window.addEventListener('online', handleOnline);
            visibilityBound = true;
        }
    };

    const disconnect = () => {
        connected = false;
        stopTimers();
        if (visibilityBound) {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('online', handleOnline);
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
            activity: user.activity,
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
        reconcile,
        fetchOnlineUsers,
        getUserStatus,
        updateUserStatus,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(usePresenceStore, import.meta.hot));
}
