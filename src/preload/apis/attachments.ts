import { ipcRenderer } from 'electron';

export const attachmentsApi = {
    downloadBuffer: (url: string) => ipcRenderer.invoke('attachment:downloadBuffer', url) as Promise<ArrayBuffer>,

    prepareVideo: (params: { attachmentId: string; downloadUrl: string; mimeType: string }) =>
        ipcRenderer.invoke('video:prepare', params) as Promise<{ data: Uint8Array<ArrayBuffer>; mimeType: string }>,

    cleanupVideo: (attachmentId: string) => ipcRenderer.invoke('video:cleanup', attachmentId) as Promise<void>,

    generateVideoThumbnail: (params: { fileData: Uint8Array; mimeType: string }) =>
        ipcRenderer.invoke('video:generateThumbnail', params) as Promise<{
            dataUrl: string;
            width: number;
            height: number;
        } | null>,

    generateThumbnail: (params: { fileData: Uint8Array; mimeType: string }) =>
        ipcRenderer.invoke('attachment:generateThumbnail', params) as Promise<{
            thumbnail: Uint8Array<ArrayBuffer>;
            size: number;
            width: number;
            height: number;
            format: string;
        } | null>,
};
