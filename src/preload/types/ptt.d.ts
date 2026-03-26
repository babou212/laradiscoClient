export interface PttCapturedKey {
    keycode: number;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
}

export interface PttApi {
    configure: (config: {
        keycode: number | null;
        ctrl: boolean;
        shift: boolean;
        alt: boolean;
        meta: boolean;
        enabled: boolean;
    }) => Promise<{ success: boolean }>;
    captureNextKey: () => Promise<PttCapturedKey>;
    cancelCapture: () => Promise<{ success: boolean }>;
    onActivated: (callback: () => void) => void;
    onDeactivated: (callback: () => void) => void;
    removeAllListeners: () => void;
}
