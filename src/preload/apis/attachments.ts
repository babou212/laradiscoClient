import { ipcRenderer } from 'electron';

export const attachmentsApi = {
    encrypt: (fileData: Uint8Array) =>
        ipcRenderer.invoke('attachment:encrypt', fileData) as Promise<{
            encrypted: Uint8Array<ArrayBuffer>;
            key: string;
            iv: string;
            size: number;
        }>,

    decrypt: (params: { encryptedBase64: string; key: string; iv: string; outputPath: string }) =>
        ipcRenderer.invoke('attachment:decrypt', params) as Promise<void>,

    decryptBuffer: (params: { encryptedBase64: string; key: string; iv: string }) =>
        ipcRenderer.invoke('attachment:decryptBuffer', params) as Promise<string>,

    downloadBuffer: (url: string) => ipcRenderer.invoke('attachment:downloadBuffer', url) as Promise<ArrayBuffer>,

    prepareVideo: (params: { attachmentId: string; downloadUrl: string; key: string; iv: string; mimeType: string }) =>
        ipcRenderer.invoke('video:prepare', params) as Promise<string>,

    cleanupVideo: (attachmentId: string) => ipcRenderer.invoke('video:cleanup', attachmentId) as Promise<void>,

    generateVideoThumbnail: (params: { fileData: Uint8Array; mimeType: string }) =>
        ipcRenderer.invoke('video:generateThumbnail', params) as Promise<{
            dataUrl: string;
            width: number;
            height: number;
        } | null>,

    generateThumbnail: (params: { fileData: Uint8Array; mimeType: string }) =>
        ipcRenderer.invoke('attachment:generateThumbnail', params) as Promise<{
            thumbnailEncrypted: Uint8Array<ArrayBuffer>;
            thumbnailKey: string;
            thumbnailIv: string;
            thumbnailSize: number;
            width: number;
            height: number;
            format: string;
        } | null>,
};
