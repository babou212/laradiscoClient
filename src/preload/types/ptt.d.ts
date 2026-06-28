export interface PttModifiers {
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    meta: boolean;
}

export type PttBinding =
    | { device: 'keyboard'; keycode: number; modifiers: PttModifiers }
    | { device: 'mouse'; button: number };

export type PttCapture =
    | { device: 'keyboard'; keycode: number; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }
    | { device: 'mouse'; button: number };

/**
 * Linux input-access status. On non-Linux platforms `supported` is false and
 * `hasAccess` is true (the global hook needs no special device permissions).
 */
export interface PttLinuxInputStatus {
    supported: boolean;
    hasAccess: boolean;
    ruleInstalled: boolean;
}

/** Outcome of the one-click `setupLinuxInputAccess` flow. */
export interface PttLinuxSetupResult {
    status: 'installed' | 'cancelled' | 'error';
    message?: string;
    hasAccess: boolean;
}

export interface PttApi {
    configure: (config: { enabled: boolean; binding: PttBinding | null }) => Promise<{ success: boolean }>;
    captureNextKey: () => Promise<PttCapture>;
    cancelCapture: () => Promise<{ success: boolean }>;
    linuxInputStatus: () => Promise<PttLinuxInputStatus>;
    setupLinuxInputAccess: () => Promise<PttLinuxSetupResult>;
    onActivated: (callback: () => void) => () => void;
    onDeactivated: (callback: () => void) => () => void;
    removeAllListeners: () => void;
}
