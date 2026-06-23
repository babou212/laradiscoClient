import api from './client';
import type { JsonApiCollectionResponse, JsonApiResponse, SoundResource } from './types';

/** A soundboard clip, flattened from its JSON:API resource. */
export interface Sound {
    id: string;
    name: string;
    durationMs: number;
    url: string | null;
    mimeType: string | null;
    uploadedById: string | null;
}

export function normalizeSound(resource: SoundResource): Sound {
    const a = resource.attributes;
    return {
        id: resource.id,
        name: a.name,
        durationMs: a.duration_ms,
        url: a.url ?? null,
        mimeType: a.mime_type ?? null,
        uploadedById: a.uploaded_by_id != null ? String(a.uploaded_by_id) : null,
    };
}

export async function listSounds(): Promise<Sound[]> {
    const r = await api.get<JsonApiCollectionResponse<SoundResource>>('/soundboard/sounds');
    return (r.data.data ?? []).map(normalizeSound);
}

export async function uploadSound(
    name: string,
    file: Blob,
    fileName: string,
    onProgress?: (progress: number) => void,
): Promise<Sound> {
    const formData = new FormData();
    formData.append('name', name);
    // Pass the filename explicitly so a bare Blob isn't sent as "blob".
    formData.append('file', file, fileName);

    const r = await api.post<JsonApiResponse<SoundResource>>('/soundboard/sounds', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120_000,
        onUploadProgress: (e) => {
            if (onProgress && e.total) {
                onProgress(Math.round((e.loaded / e.total) * 100));
            }
        },
    });
    return normalizeSound(r.data.data);
}

export function deleteSound(soundId: string): Promise<void> {
    return api.delete(`/soundboard/sounds/${soundId}`);
}

/**
 * Trigger a sound for everyone in the voice channel. The server pushes a
 * data packet to the LiveKit room; each connected client (including this one)
 * plays the clip locally when it arrives.
 */
export function playSound(channelId: string | number, soundId: string | number): Promise<void> {
    return api.post(`/channels/${channelId}/voice/soundboard/play`, { sound_id: Number(soundId) });
}
