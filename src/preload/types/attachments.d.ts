export interface AttachmentsApi {
    encrypt(fileData: Uint8Array): Promise<{
        encrypted: Uint8Array<ArrayBuffer>;
        key: string;
        iv: string;
        size: number;
    }>;

    decryptBuffer(params: { encryptedBase64: string; key: string; iv: string }): Promise<string>;

    downloadBuffer(url: string): Promise<ArrayBuffer>;

    prepareVideo(params: {
        attachmentId: string;
        downloadUrl: string;
        key: string;
        iv: string;
        mimeType: string;
    }): Promise<string>;

    cleanupVideo(attachmentId: string): Promise<void>;

    generateVideoThumbnail(params: {
        fileData: Uint8Array;
        mimeType: string;
    }): Promise<{ dataUrl: string; width: number; height: number } | null>;

    generateThumbnail(params: { fileData: Uint8Array; mimeType: string }): Promise<{
        thumbnailEncrypted: Uint8Array<ArrayBuffer>;
        thumbnailKey: string;
        thumbnailIv: string;
        thumbnailSize: number;
        width: number;
        height: number;
        format: string;
    } | null>;
}
