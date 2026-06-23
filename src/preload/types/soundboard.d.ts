export interface SoundboardApi {
    trim(fileData: Uint8Array, startSec: number, endSec: number): Promise<{ data: Uint8Array; mimeType: string }>;
}
