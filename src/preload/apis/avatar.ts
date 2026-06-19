import { ipcRenderer } from 'electron';

export const avatarApi = {
    /**
     * Ensure an avatar (given its presigned URL) is cached locally and return a
     * stable `avatar://` URL for it, or null if it could not be cached.
     */
    resolve: (url: string) => ipcRenderer.invoke('avatar:resolve', url) as Promise<string | null>,
};
