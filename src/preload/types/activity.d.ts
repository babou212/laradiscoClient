export type ClientActivityType = 'game' | 'music' | 'app';

/**
 * Activity as detected on this machine and handed to the renderer. `started_at`
 * is intentionally absent here — the backend stamps it server-side.
 */
export interface ClientActivity {
    type: ClientActivityType;
    name: string;
    application_id: string;
    details: string | null;
    icon: string | null;
}

export interface ActivityApi {
    /** Subscribe to detected-activity changes (null = nothing playing). */
    onChanged: (callback: (activity: ClientActivity | null) => void) => void;
    /** Remove all activity-change listeners (e.g. on logout). */
    removeChangedListeners: () => void;
    /** Enable or disable local process detection (the privacy toggle). */
    setEnabled: (enabled: boolean) => Promise<{ success: boolean }>;
    /** The currently detected activity, if any (for resync). */
    getCurrent: () => Promise<ClientActivity | null>;
}
