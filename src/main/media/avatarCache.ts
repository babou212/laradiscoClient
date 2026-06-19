import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readdir, readFile, rm, stat, utimes, writeFile } from 'fs/promises';
import { join } from 'path';
import { app, net } from 'electron';
import { logger } from '../logger';

// Avatars are cached to disk keyed by the storage object's *path* (the presigned
// URL minus its signature/query). Re-signing the same avatar yields the same key,
// so we download a given avatar exactly once; uploading a new avatar creates a new
// Spatie media record (new path) → new key → the old cache entry is simply unused.
// This is what makes "cache locally, only refetch when it changes" hold without
// any backend change, despite the URLs being short-lived presigned links.

const MAX_ENTRIES = 1000;
const KEY_RE = /^[a-f0-9]{64}$/;

function cacheDir(): string {
    return join(app.getPath('userData'), 'avatar-cache');
}

/** Stable cache key for an avatar URL: sha256 of its path, ignoring the signature query. */
export function avatarKeyForUrl(rawUrl: string): string | null {
    try {
        const { pathname } = new URL(rawUrl);
        return createHash('sha256').update(pathname).digest('hex');
    } catch {
        return null;
    }
}

const inflight = new Map<string, Promise<string | null>>();

async function download(key: string, url: string): Promise<string | null> {
    try {
        const response = await net.fetch(url);
        if (!response.ok) {
            logger.error('[avatarCache] download failed', { status: response.status, url });
            return null;
        }
        const data = Buffer.from(await response.arrayBuffer());
        await mkdir(cacheDir(), { recursive: true });
        await writeFile(join(cacheDir(), key), data);
        return key;
    } catch (err) {
        logger.error('[avatarCache] download error', err);
        return null;
    }
}

/**
 * Ensure the avatar at `url` is present on disk and return its cache key.
 * Returns null if the URL is unusable or the download failed.
 */
export async function ensureAvatarCached(url: string): Promise<string | null> {
    const key = avatarKeyForUrl(url);
    if (!key) return null;

    const file = join(cacheDir(), key);
    if (existsSync(file)) {
        // Bump mtime so the LRU prune keeps recently-used avatars.
        void utimes(file, new Date(), new Date()).catch(() => {});
        return key;
    }

    const existing = inflight.get(key);
    if (existing) return existing;

    const promise = download(key, url).finally(() => inflight.delete(key));
    inflight.set(key, promise);
    return promise;
}

function sniffMime(buf: Buffer): string {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
    if (buf.length >= 6 && buf.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
    if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
        return 'image/webp';
    return 'application/octet-stream';
}

/** Read a cached avatar by key. Returns null if the key is malformed or the file is absent. */
export async function readAvatarFile(key: string): Promise<{ data: Buffer; mime: string } | null> {
    if (!KEY_RE.test(key)) return null;
    const file = join(cacheDir(), key);
    if (!existsSync(file)) return null;
    try {
        const data = await readFile(file);
        return { data, mime: sniffMime(data) };
    } catch (err) {
        logger.error('[avatarCache] read error', err);
        return null;
    }
}

/** Best-effort LRU prune so the cache directory can't grow without bound. */
export async function pruneAvatarCache(): Promise<void> {
    try {
        const dir = cacheDir();
        if (!existsSync(dir)) return;
        const names = (await readdir(dir)).filter((n) => KEY_RE.test(n));
        if (names.length <= MAX_ENTRIES) return;

        const entries = await Promise.all(
            names.map(async (name) => {
                try {
                    return { name, mtime: (await stat(join(dir, name))).mtimeMs };
                } catch {
                    return { name, mtime: 0 };
                }
            }),
        );
        entries.sort((a, b) => a.mtime - b.mtime);
        const toDelete = entries.slice(0, entries.length - MAX_ENTRIES);
        await Promise.all(toDelete.map((e) => rm(join(dir, e.name), { force: true }).catch(() => {})));
        logger.info(`[avatarCache] pruned ${toDelete.length} entries`);
    } catch (err) {
        logger.error('[avatarCache] prune error', err);
    }
}
