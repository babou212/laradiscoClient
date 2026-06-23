import { ipcRenderer } from 'electron';

export const soundboardApi = {
    /**
     * Trim an audio clip to the [startSec, endSec] window (re-encoded to
     * Opus/Ogg) using the bundled ffmpeg. Returns the trimmed bytes ready to
     * upload. Duration is clamped to 10s.
     */
    trim: (fileData: Uint8Array, startSec: number, endSec: number) =>
        ipcRenderer.invoke('soundboard:trim', { fileData, startSec, endSec }) as Promise<{
            data: Uint8Array;
            mimeType: string;
        }>,
};
