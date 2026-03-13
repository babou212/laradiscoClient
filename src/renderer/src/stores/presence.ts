import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import api from '@/lib/api';
import { getEcho } from '@/lib/echo';
import type { OnlineUser, UserStatusType } from '@/types';

const HEARTBEAT_INTERVAL_MS = 60_000;
const SYNC_INTERVAL_MS = 120_000;

export const usePresenceStore = defineStore('presence', () => {
    const onlineUsers = ref<OnlineUser[]>([]);
    const serverMembers = ref<OnlineUser[]>([]);
    let channel: ReturnType<typeof getEcho>['private'] extends (ch: string) => infer R ? R : unknown = null as any;
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

        // Include online users who are beyond the first page of serverMembers
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
            const response = await api.get('/members');
            serverMembers.value = response.data?.members ?? response.data ?? [];
        } catch {
            // Will retry on next sync
        }
    };

    const fetchOnlineUsers = async () => {
        try {
            const response = await api.get('/presence');
            const users: OnlineUser[] = response.data ?? [];
            onlineUsers.value = users.map((u) => ({
                ...u,
                status: u.status || 'online',
            }));
        } catch {
            // Will retry on next sync interval
        }
    };

    const sendHeartbeat = async () => {
        try {
            await api.post('/presence/heartbeat');
        } catch {
            // Heartbeat failure is non-critical
        }
    };

    const applyPresenceUpdate = (data: any) => {
        const idx = onlineUsers.value.findIndex((u) => u.id === data.user_id);

        if (data.status === 'offline') {
            if (idx !== -1) {
                onlineUsers.value.splice(idx, 1);
            }
        } else if (idx !== -1) {
            onlineUsers.value[idx].status = data.status;
            onlineUsers.value[idx].custom_status = data.custom_status;
        } else {
            onlineUsers.value.push({
                id: data.user_id,
                username: data.username,
                display_name: data.display_name ?? data.username,
                avatar_path: data.avatar_path ?? null,
                status: data.status,
                custom_status: data.custom_status,
            });
        }
    };

    const connect = async () => {
        if (channel) return;

        await fetchMembers();

        // Subscribe to the presence channel BEFORE announcing ourselves
        // so we (and our local store) catch our own broadcast event.
        try {
            const echo = getEcho();
            channel = echo.private('presence') as any;
            (channel as any).listen('.user.presence.updated', applyPresenceUpdate);
        } catch (error) {
            console.error('Failed to connect to presence channel:', error);
        }

        // Explicitly register ourselves as online — ensures we appear in
        // the presence list even if the login event was not handled by the
        // session-based auth listener on the server.
        try {
            await api.patch('/presence', { status: 'online' });
        } catch {
            // Non-critical — heartbeat will re-register us
        }

        // Fetch the full online list AFTER registration so we are included.
        await fetchOnlineUsers();

        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (syncTimer) clearInterval(syncTimer);
        heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
        syncTimer = setInterval(fetchOnlineUsers, SYNC_INTERVAL_MS);
    };

    const disconnect = () => {
        if (channel) {
            try {
                const echo = getEcho();
                echo.leave('presence');
            } catch {
                // Already disconnected
            }
            channel = null as any;
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

    /**
     * Notify the server that this user is going offline.
     * Uses a fire-and-forget approach suitable for app close scenarios.
     */
    const goOffline = () => {
        try {
            api.patch('/presence', { status: 'offline' }).catch(() => {});
        } catch {
            // Best-effort
        }
    };

    const getUserStatus = (userId: number): OnlineUser | undefined => {
        return allMembers.value.find((u) => u.id === userId);
    };

    const updateUserStatus = (userId: number, status: UserStatusType, customStatus: string | null = null) => {
        const user = onlineUsers.value.find((u) => u.id === userId);
        if (user) {
            user.status = status;
            user.custom_status = customStatus;
        }
    };

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
    };
});
