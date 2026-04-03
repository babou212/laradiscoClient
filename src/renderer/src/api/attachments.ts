import api from './client';

export interface UploadResponse {
    attachment_id: string;
    encrypted_size: number;
    thumbnail_size?: number | null;
}

export interface DownloadUrlResponse {
    download_url: string;
    thumbnail_url?: string;
}

export async function getAttachmentDownloadUrl(
    attachmentId: string,
): Promise<DownloadUrlResponse> {
    const r = await api.get(`/attachments/${attachmentId}/download`);
    return r.data?.data ?? r.data;
}

export async function uploadChannelAttachment(
    channelId: string | number,
    file: Blob,
    thumbnail?: Blob | null,
    onProgress?: (progress: number) => void,
): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (thumbnail) {
        formData.append('thumbnail', thumbnail);
    }

    const r = await api.post(`/channels/${channelId}/attachments/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300_000,
        onUploadProgress: (e) => {
            if (onProgress && e.total) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        },
    });
    return r.data?.data ?? r.data;
}

export async function uploadDmAttachment(
    groupId: string | number,
    file: Blob,
    thumbnail?: Blob | null,
    onProgress?: (progress: number) => void,
): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);
    if (thumbnail) {
        formData.append('thumbnail', thumbnail);
    }

    const r = await api.post(`/direct-messages/${groupId}/attachments/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300_000,
        onUploadProgress: (e) => {
            if (onProgress && e.total) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        },
    });
    return r.data?.data ?? r.data;
}
