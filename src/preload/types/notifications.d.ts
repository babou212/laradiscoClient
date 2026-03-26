export interface NotificationsApi {
    show: (payload: { title: string; body: string; notificationId: string }) => void;
    onClicked: (callback: (notificationId: string) => void) => void;
    removeAllListeners: () => void;
}
