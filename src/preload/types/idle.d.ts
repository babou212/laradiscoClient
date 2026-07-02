export interface IdleApi {
    /** Seconds since the last system-wide user input (keyboard/mouse). */
    getSystemIdleTime: () => Promise<number>;
}
