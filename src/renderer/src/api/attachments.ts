import api from './client';

export interface PresignResponse {
    attachment_id: string;
    upload_url: string;
    upload_headers?: Record<string, string>;
    thumbnail_upload_url?: string;
    thumbnail_upload_headers?: Record<string, string>;
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

export async function presignChannelAttachment(
    channelId: string | number,
    data: { file_size: number; has_thumbnail: boolean },
): Promise<PresignResponse> {
    const r = await api.post(`/channels/${channelId}/attachments/presign`, data);
    return r.data?.data ?? r.data;
}

export async function presignDmAttachment(
    groupId: string | number,
    data: { file_size: number; has_thumbnail: boolean },
): Promise<PresignResponse> {
    const r = await api.post(`/direct-messages/${groupId}/attachments/presign`, data);
    return r.data?.data ?? r.data;
}

export function confirmAttachment(attachmentId: string): Promise<void> {
    return api.post(`/attachments/${attachmentId}/confirm`);
}
