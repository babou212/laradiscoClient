import { updateActivity, type ActivityInput } from '@/api/presence';
import { getProfile } from '@/api/settings';

/**
 * Drives local rich-presence detection for the current user. The Electron main
 * process scans running processes and emits `activity:changed`; this reporter
 * relays those to the backend, gated by the user's `show_activity` privacy
 * preference. Only the logged-in user reports their own activity — other users'
 * activity arrives over the `presence` channel into the users store.
 */
let started = false;
let enabled = false;

function relay(activity: ActivityInput | null): void {
    if (!enabled) return;
    const payload: ActivityInput | null = activity
        ? {
              type: activity.type,
              name: activity.name,
              application_id: activity.application_id,
              details: activity.details ?? null,
              icon: activity.icon ?? null,
          }
        : null;
    void updateActivity(payload).catch((error) => console.error('Failed to report activity', error));
}

/**
 * Enable or disable detection. When disabling we also clear any activity that
 * was already broadcast so other clients stop seeing it immediately.
 */
export async function setActivityEnabled(value: boolean): Promise<void> {
    enabled = value;
    try {
        await window.api?.activity?.setEnabled(value);
    } catch (error) {
        console.error('Failed to toggle activity detection', error);
    }
    if (!value) {
        void updateActivity(null).catch(() => {});
    }
}

export async function startActivityReporter(): Promise<void> {
    if (started) return;
    started = true;

    window.api?.activity?.onChanged((activity) => relay(activity));

    // Honour the persisted privacy preference at startup (default ON).
    let show = true;
    try {
        const profile = await getProfile();
        show = profile.data.attributes.show_activity ?? true;
    } catch (error) {
        console.error('Failed to load activity preference', error);
    }
    await setActivityEnabled(show);
}

export function stopActivityReporter(): void {
    if (!started) return;
    started = false;
    enabled = false;
    window.api?.activity?.removeChangedListeners();
    void window.api?.activity?.setEnabled(false).catch(() => {});
}
