import { acceptHMRUpdate, defineStore } from 'pinia';
import { ref } from 'vue';

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

const RECONNECT_GRACE_MS = 2500;
const DOWN_ESCALATE_MS = 15_000;

export const useConnectionStore = defineStore('connection', () => {
    const status = ref<ConnectionStatus>('connected');

    let active = false;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    let escalateTimer: ReturnType<typeof setTimeout> | null = null;

    const clearTimers = () => {
        if (graceTimer) {
            clearTimeout(graceTimer);
            graceTimer = null;
        }
        if (escalateTimer) {
            clearTimeout(escalateTimer);
            escalateTimer = null;
        }
    };

    const scheduleEscalation = () => {
        if (escalateTimer) return;
        escalateTimer = setTimeout(() => {
            escalateTimer = null;
            if (!active) return;
            status.value = 'disconnected';
        }, DOWN_ESCALATE_MS);
    };

    const beginNotConnected = () => {
        if (graceTimer || escalateTimer || status.value !== 'connected') return;
        graceTimer = setTimeout(() => {
            graceTimer = null;
            if (!active) return;
            status.value = 'reconnecting';
            scheduleEscalation();
        }, RECONNECT_GRACE_MS);
    };

    const setRealtimeState = (pusherState: string) => {
        if (!active) return;
        if (pusherState === 'connected') {
            clearTimers();
            status.value = 'connected';
            return;
        }
        beginNotConnected();
    };

    const setNetworkOnline = (online: boolean) => {
        if (!active) return;
        if (!online) {
            clearTimers();
            status.value = 'disconnected';
            return;
        }

        if (status.value !== 'connected') {
            if (graceTimer) {
                clearTimeout(graceTimer);
                graceTimer = null;
            }
            status.value = 'reconnecting';
            scheduleEscalation();
        }
    };

    const handleOnline = () => setNetworkOnline(true);
    const handleOffline = () => setNetworkOnline(false);

    const connect = () => {
        if (active) return;
        active = true;
        status.value = 'connected';
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
    };

    const disconnect = () => {
        clearTimers();
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        active = false;

        status.value = 'connected';
    };

    function $reset(): void {
        disconnect();
    }

    return {
        status,
        connect,
        disconnect,
        setRealtimeState,
        setNetworkOnline,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useConnectionStore, import.meta.hot));
}
