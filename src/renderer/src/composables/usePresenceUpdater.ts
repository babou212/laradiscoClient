import { usePresenceStore } from '@/stores/presence';

// Presence is driven entirely by heartbeats now: the server derives
// online/idle/offline from heartbeat freshness, and the user's manual choice
// (online / dnd / appear-offline) is sent directly via the status PATCH. This
// module only retains the belt-and-braces "mark me offline as the app closes"
// hook; the old mouse/keyboard inactivity → idle detector has been removed.

let started = false;

function onBeforeUnload(): void {
    usePresenceStore().goOffline();
}

export function startPresenceUpdater(): void {
    if (started) return;
    started = true;
    window.addEventListener('beforeunload', onBeforeUnload);
}

export function stopPresenceUpdater(): void {
    if (!started) return;
    started = false;
    window.removeEventListener('beforeunload', onBeforeUnload);
}
