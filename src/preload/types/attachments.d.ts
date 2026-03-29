export interface AttachmentsApi {
    encrypt(fileDataBase64: string): Promise<{
        encrypted: string;
        key: string;
        iv: string;
        size: number;
    }>;

    decrypt(params: { encryptedBase64: string; key: string; iv: string; outputPath: string }): Promise<void>;

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
        fileDataBase64: string;
        mimeType: string;
    }): Promise<{ dataUrl: string; width: number; height: number } | null>;

    generateThumbnail(params: { fileDataBase64: string; mimeType: string }): Promise<{
        thumbnailBase64: string;
        thumbnailEncrypted: string;
        thumbnailKey: string;
        thumbnailIv: string;
        thumbnailSize: number;
        width: number;
        height: number;
        format: string;
    } | null>;
}
