export interface ScreenSource {
    id: string;
    name: string;
    thumbnail: string;
    appIcon: string | null;
    display_id: string;
}

export interface ScreenApi {
    onShowPicker: (callback: (sources: ScreenSource[]) => void) => void;
    selectSource: (sourceId: string | null) => void;
    removeAllListeners: () => void;
}
