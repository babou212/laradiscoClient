import { ipcRenderer } from 'electron';

export const attachmentsApi = {
    encrypt: (fileDataBase64: string) =>
        ipcRenderer.invoke('attachment:encrypt', fileDataBase64) as Promise<{
            encrypted: string;
            key: string;
            iv: string;
            size: number;
        }>,

    decrypt: (params: { encryptedBase64: string; key: string; iv: string; outputPath: string }) =>
        ipcRenderer.invoke('attachment:decrypt', params) as Promise<void>,

    decryptBuffer: (params: { encryptedBase64: string; key: string; iv: string }) =>
        ipcRenderer.invoke('attachment:decryptBuffer', params) as Promise<string>,

    downloadBuffer: (url: string) => ipcRenderer.invoke('attachment:downloadBuffer', url) as Promise<Buffer>,

    prepareVideo: (params: { attachmentId: string; downloadUrl: string; key: string; iv: string; mimeType: string }) =>
        ipcRenderer.invoke('video:prepare', params) as Promise<string>,

    cleanupVideo: (attachmentId: string) => ipcRenderer.invoke('video:cleanup', attachmentId) as Promise<void>,

    generateVideoThumbnail: (params: { fileDataBase64: string; mimeType: string }) =>
        ipcRenderer.invoke('video:generateThumbnail', params) as Promise<{
            dataUrl: string;
            width: number;
            height: number;
        } | null>,

    generateThumbnail: (params: { fileDataBase64: string; mimeType: string }) =>
        ipcRenderer.invoke('attachment:generateThumbnail', params) as Promise<{
            thumbnailBase64: string;
            thumbnailEncrypted: string;
            thumbnailKey: string;
            thumbnailIv: string;
            thumbnailSize: number;
            width: number;
            height: number;
            format: string;
        } | null>,
};
