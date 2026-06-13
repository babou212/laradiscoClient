export interface AttachmentsApi {
    downloadBuffer(url: string): Promise<ArrayBuffer>;

    prepareVideo(params: {
        attachmentId: string;
        downloadUrl: string;
        mimeType: string;
    }): Promise<{ data: Uint8Array<ArrayBuffer>; mimeType: string }>;

    cleanupVideo(attachmentId: string): Promise<void>;

    generateVideoThumbnail(params: {
        fileData: Uint8Array;
        mimeType: string;
    }): Promise<{ dataUrl: string; width: number; height: number } | null>;

    generateThumbnail(params: { fileData: Uint8Array; mimeType: string }): Promise<{
        thumbnail: Uint8Array<ArrayBuffer>;
        size: number;
        width: number;
        height: number;
        format: string;
    } | null>;
}
