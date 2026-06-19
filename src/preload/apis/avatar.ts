import { ipcRenderer } from 'electron';

export const avatarApi = {
    /**
     * Ensure a user's avatar (given its presigned URL) is cached locally and
     * return a stable `avatar://` URL for it, or null if it could not be cached.
     * Caching a new version purges the user's older cached avatars.
     */
    resolve: (userId: string, url: string) =>
        ipcRenderer.invoke('avatar:resolve', userId, url) as Promise<string | null>,

    /** Delete every cached avatar for a user (e.g. when their avatar is removed). */
    forget: (userId: string) => ipcRenderer.invoke('avatar:forget', userId) as Promise<void>,
};
