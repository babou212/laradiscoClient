export interface UpdaterApi {
    check: () => Promise<{ success: boolean; version?: string; error?: string }>;
    download: () => Promise<{ success: boolean; error?: string }>;
    install: () => void;
    onUpdateAvailable: (callback: (info: { version: string; releaseNotes: string }) => void) => void;
    onUpToDate: (callback: () => void) => void;
    onDownloadProgress: (
        callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void,
    ) => void;
    onUpdateDownloaded: (callback: () => void) => void;
    onError: (callback: (error: string) => void) => void;
    removeAllListeners: () => void;
}
