export interface LogSaveResult {
    success: boolean;
    canceled?: boolean;
    error?: string;
}

export interface LogApi {
    getPath: () => Promise<string>;
    reveal: () => Promise<{ success: boolean }>;
    save: () => Promise<LogSaveResult>;
}
