import api from '@/lib/api';
import { usePresenceStore } from '@/stores/presence';
import type { UserStatusType } from '@/types';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const ACTIVITY_THROTTLE_MS = 30_000;

let idleTimer: ReturnType<typeof setTimeout> | null = null;
let lastActivityCheck = 0;
let currentAutoStatus: UserStatusType | null = null;
let userManualStatus: UserStatusType | null = null;
let started = false;

const activityEvents = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll', 'click'] as const;

function setStatus(status: UserStatusType): void {
    api.patch('/presence', { status }).catch(() => {});
}

function goIdle(): void {
    if (userManualStatus === 'dnd' || userManualStatus === 'offline') return;
    if (currentAutoStatus !== 'idle') {
        currentAutoStatus = 'idle';
        setStatus('idle');
    }
}

function restoreOnline(): void {
    if (userManualStatus === 'dnd' || userManualStatus === 'offline') return;
    if (currentAutoStatus === 'idle') {
        currentAutoStatus = 'online';
        setStatus('online');
    }
}

function onActivity(): void {
    const now = Date.now();
    if (now - lastActivityCheck < ACTIVITY_THROTTLE_MS) return;
    lastActivityCheck = now;

    restoreOnline();

    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(goIdle, IDLE_TIMEOUT_MS);
}

function onVisibilityChange(): void {
    if (document.hidden) {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(goIdle, IDLE_TIMEOUT_MS);
    } else {
        lastActivityCheck = 0;
        onActivity();
    }
}

function onBeforeUnload(): void {
    const presenceStore = usePresenceStore();
    presenceStore.goOffline();
}

export function startPresenceUpdater(): void {
    if (started) return;
    started = true;
    currentAutoStatus = 'online';
    userManualStatus = null;
    lastActivityCheck = Date.now();

    for (const event of activityEvents) {
        window.addEventListener(event, onActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', onBeforeUnload);

    idleTimer = setTimeout(goIdle, IDLE_TIMEOUT_MS);
}

export function stopPresenceUpdater(): void {
    if (!started) return;
    started = false;

    for (const event of activityEvents) {
        window.removeEventListener(event, onActivity);
    }
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('beforeunload', onBeforeUnload);

    if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
    }

    currentAutoStatus = null;
    userManualStatus = null;
}

export function setManualPresenceStatus(status: UserStatusType): void {
    userManualStatus = status;
    if (status === 'online') {
        currentAutoStatus = 'online';
        userManualStatus = null;
    }
}
