import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, readdir, readFile, rm, stat, utimes, writeFile } from 'fs/promises';
import { join } from 'path';
import { app, net } from 'electron';
import { logger } from '../logger';
import { getAuthSession } from '../auth-storage';

const MAX_ENTRIES = 1000;
const KEY_RE = /^\d+__[A-Za-z0-9]+__[a-f0-9]{64}$/;
const USER_RE = /^\d+$/;

function cacheDir(): string {
    return join(app.getPath('userData'), 'avatar-cache');
}

/** The avatar version is the Spatie media id embedded in the URL path. */
export function versionToken(pathname: string): string {
    const segs = pathname.split('/');
    const ai = segs.indexOf('avatar');
    if (ai >= 0 && /^\d+$/.test(segs[ai + 1] ?? '')) return segs[ai + 1];

    for (const seg of segs) {
        if (/^\d+$/.test(seg)) return seg;
    }

    const dir = pathname.replace(/[^/]+$/, '');
    return 'x' + createHash('sha1').update(dir).digest('hex');
}

export function keyForUrl(userId: string, rawUrl: string): { key: string; version: string } | null {
    if (!USER_RE.test(userId)) return null;
    try {
        const { pathname } = new URL(rawUrl);
        const version = versionToken(pathname);
        const fileHash = createHash('sha256').update(pathname).digest('hex');
        return { key: `${userId}__${version}__${fileHash}`, version };
    } catch {
        return null;
    }
}

const inflight = new Map<string, Promise<string | null>>();

/** Delete every cached file for `userId` whose version differs from `keepVersion`. */
async function purgeOldVersions(userId: string, keepVersion: string): Promise<void> {
    try {
        const dir = cacheDir();
        if (!existsSync(dir)) return;
        const prefix = `${userId}__`;
        const keepPrefix = `${userId}__${keepVersion}__`;
        const stale = (await readdir(dir)).filter((n) => n.startsWith(prefix) && !n.startsWith(keepPrefix));
        await Promise.all(stale.map((n) => rm(join(dir, n), { force: true }).catch(() => {})));
        if (stale.length) logger.info(`[avatarCache] purged ${stale.length} stale file(s) for user ${userId}`);
    } catch (err) {
        logger.error('[avatarCache] purge error', err);
    }
}

async function download(key: string, url: string, authToken: string | null): Promise<boolean> {
    try {
        const headers: Record<string, string> = {};
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        const headers: Record<string, string> = {};
        try {
            const token = getAuthSession()?.token;
            if (token) headers.Authorization = `Bearer ${token}`;
        } catch {
            // OS keychain unavailable — fall through unauthenticated.
        }
        const response = await net.fetch(url, { headers }, { headers });
        if (!response.ok) {
            logger.error('[avatarCache] download failed', { status: response.status });
            return false;
        }
        const data = Buffer.from(await response.arrayBuffer());
        await mkdir(cacheDir(), { recursive: true });
        await writeFile(join(cacheDir(), key), data);
        return true;
    } catch (err) {
        logger.error('[avatarCache] download error', err);
        return false;
    }
}

/**
 * Ensure the avatar at `url` (owned by `userId`) is cached on disk and return its
 * cache key, purging any older-version avatars for that user. Returns null on failure.
 */
export async function ensureAvatarCached(
    userId: string,
    url: string,
    authToken: string | null = null,
): Promise<string | null> {
    const resolved = keyForUrl(userId, url);
    if (!resolved) return null;
    const { key, version } = resolved;

    const file = join(cacheDir(), key);
    if (existsSync(file)) {
        void utimes(file, new Date(), new Date()).catch(() => {});

        void purgeOldVersions(userId, version);
        return key;
    }

    const existing = inflight.get(key);
    if (existing) return existing;

    const promise = (async () => {
        const ok = await download(key, url, authToken);
        if (!ok) return null;
        await purgeOldVersions(userId, version);
        return key;
    })().finally(() => inflight.delete(key));

    inflight.set(key, promise);
    return promise;
}

/** Delete every cached file for a user (used when their avatar is removed). */
export async function forgetUser(userId: string): Promise<void> {
    if (!USER_RE.test(userId)) return;
    try {
        const dir = cacheDir();
        if (!existsSync(dir)) return;
        const prefix = `${userId}__`;
        const files = (await readdir(dir)).filter((n) => n.startsWith(prefix));
        await Promise.all(files.map((n) => rm(join(dir, n), { force: true }).catch(() => {})));
        if (files.length) logger.info(`[avatarCache] forgot ${files.length} file(s) for user ${userId}`);
    } catch (err) {
        logger.error('[avatarCache] forget error', err);
    }
}

export function sniffMime(buf: Buffer): string {
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
