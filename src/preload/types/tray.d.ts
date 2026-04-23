export interface TrayApi {
    updateUnreadCount: (count: number) => void;
    updateMuteState: (muted: boolean) => void;
    onMuteToggled: (callback: (muted: boolean) => void) => void;
    removeAllListeners: () => void;
}
