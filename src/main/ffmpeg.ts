import { existsSync } from 'fs';
import { sep } from 'path';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

// In a packaged build the binaries cannot be executed from inside the asar
// archive, so electron-builder unpacks them to app.asar.unpacked (see
// asarUnpack in electron-builder.yml). The *-static packages still hand back a
// path pointing into app.asar, so rewrite it to the unpacked location.
export function unpacked(p: string | null): string | null {
    if (!p) return null;
    return p.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`);
}

// Prefer the bundled static binary; fall back to the bare command name (resolved
// via the system PATH) for local dev where the package may be absent or the
// platform unsupported. Bundling matters because a packaged app's PATH is often
// stripped (e.g. macOS launched from Finder) — relying on PATH alone meant
// transcoding silently failed and unplayable files were served to the demuxer.
export function resolveBinary(staticPath: string | null, fallbackCommand: string): string {
    if (staticPath && existsSync(staticPath)) return staticPath;
    return fallbackCommand;
}

export const FFMPEG_PATH = resolveBinary(unpacked(ffmpegStatic), 'ffmpeg');
export const FFPROBE_PATH = resolveBinary(unpacked(ffprobeStatic.path), 'ffprobe');
