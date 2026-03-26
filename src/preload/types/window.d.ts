export interface WindowApi {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
    onMaximizedChange: (callback: (_event: unknown, isMaximized: boolean) => void) => void;
    removeMaximizedListener: () => void;
    onBeforeQuit: (callback: () => void) => void;
    removeBeforeQuitListener: () => void;
    platform: string;
}
