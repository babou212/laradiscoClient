import { execFile } from 'child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { BrowserWindow, ipcMain, net, Notification, type IpcMainInvokeEvent } from 'electron';
import sharp from 'sharp';
import { getAuthSession, removeAuthSession, saveAuthSession } from './auth-storage';
import { clearActiveServer, getActiveServer, getSetting, saveActiveServer, setSetting } from './database';
import { FFMPEG_PATH, FFPROBE_PATH } from './ffmpeg';
import { logger } from './logger';

function captureIpcError(channel: string, err: unknown): string {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(`[ipc:${channel}]`, error);
    return error.message;
}

function isTrustedSender(event: IpcMainInvokeEvent): boolean {
    const url = event.senderFrame?.url ?? '';
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    return (
        url.startsWith('app://renderer') ||
        url.startsWith('http://localhost') ||
        url.startsWith('http://127.0.0.1') ||
        (!!devUrl && url.startsWith(devUrl))
    );
}

function handle<T extends unknown[], R>(
    channel: string,
    fn: (event: IpcMainInvokeEvent, ...args: T) => R | Promise<R>,
): void {
    ipcMain.handle(channel, (event, ...args) => {
        if (!isTrustedSender(event)) {
            throw new Error(`ipc ${channel}: untrusted sender`);
        }
        return fn(event, ...(args as T));
    });
}

function isAllowedServerUrl(raw: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return false;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

    const active = getActiveServer();
    if (!active) return false;
    const host = active.host.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const [hostname, port] = host.split(':');
    if (parsed.hostname !== hostname) return false;

    const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    if (!isLoopback && port && parsed.port && parsed.port !== port) return false;
    return true;
}

const execFileAsync = promisify(execFile);

const SUPPORTED_VIDEO_CODECS = new Set(['h264', 'vp8', 'vp9', 'theora', 'mpeg4', 'mp4v', 'mpeg2video']);

const VIDEO_DIR = join(tmpdir(), 'laradisco-videos');

interface PreparedVideo {
    filePath: string;
    mimeType: string;
}

interface PreparedVideoData {
    data: Uint8Array;
    mimeType: string;
}

const videoCache = new Map<string, PreparedVideo>();
const videoPreparing = new Map<string, Promise<PreparedVideoData>>();

function videoExtForMime(mimeType: string): string {
    if (mimeType.includes('webm')) return '.webm';
    if (mimeType.includes('quicktime')) return '.mov';
    if (mimeType.includes('matroska')) return '.mkv';
    if (mimeType.includes('ogg')) return '.ogv';
    return '.mp4';
}

export async function cleanupAllVideos(): Promise<void> {
    videoCache.clear();
    videoPreparing.clear();
    await rm(VIDEO_DIR, { recursive: true, force: true }).catch(() => {});
}

import { ensureAvatarCached, forgetUser } from './media/avatarCache';
import { generateThumbnail, isImageMimeType } from './media/thumbnails';
import { unfurlUrl } from './services/unfurl';

interface AuthUser {
    id: string;
    username: string;
    email: string;
    avatar_urls: { thumb: string; small: string; medium: string; original: string } | null;
    permissions?: Record<string, boolean>;
}

/**
 * Extract an AuthUser from a JSON:API user resource object.
 *
 * Expects the shape: { data: { id, type, attributes: { ... } } }
 */
function parseUserResource(resource: Record<string, unknown>): AuthUser {
    const data = resource.data as { id: string; attributes: Record<string, unknown> };
    const attrs = data.attributes;
    return {
        id: data.id,
        username: attrs.username as string,
        email: attrs.email as string,
        avatar_urls: (attrs.avatar_urls as AuthUser['avatar_urls']) ?? null,
        permissions: attrs.permissions as Record<string, boolean> | undefined,
    };
}

function buildBaseUrl(host: string): string {
    if (host.startsWith('http://') || host.startsWith('https://')) {
        return host.replace(/\/+$/, '');
    }

    const hostname = host.split(':')[0];
    const isLocal =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname === '::1' ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.test');

    const protocol = isLocal ? 'http' : 'https';
    return `${protocol}://${host}`;
}

export function registerIpcHandlers(): void {
    handle('server:ping', async (_event, host: string) => {
        const url = `${buildBaseUrl(host)}/api/v1/ping`;
        try {
            const response = await net.fetch(url, {
                method: 'GET',
                headers: { Accept: 'application/json' },
            });

            if (!response.ok) {
                return { success: false, error: `Server returned ${response.status}` };
            }

            const data = await response.json();
            return { success: true, data };
        } catch (err: unknown) {
            return { success: false, error: captureIpcError('server:ping', err) };
        }
    });

    handle('server:save', async (_event, name: string, host: string) => {
        try {
            const connection = saveActiveServer(name, host);
            return { success: true, connection };
        } catch (err: unknown) {
            return { success: false, error: captureIpcError('server:save', err) };
        }
    });

    handle('server:getActive', async () => {
        return getActiveServer();
    });

    handle('server:getAll', async () => {
        const active = getActiveServer();
        return active ? [active] : [];
    });

    handle('server:setActive', async () => {
        return { success: true };
    });

    handle('server:remove', async () => {
        clearActiveServer();
        return { success: true };
    });

    handle('auth:login', async (_event, host: string, email: string, password: string) => {
        const url = `${buildBaseUrl(host)}/api/v1/auth/login`;
        try {
            const response = await net.fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    email,
                    password,
                    device_name: `LaraDisco Desktop (${process.platform})`,
                }),
            });

            const body = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    error: body.message || body.errors?.email?.[0] || 'Login failed',
                };
            }

            const data = body.data;

            if (data.two_factor) {
                return {
                    success: false,
                    twoFactor: true,
                    challengeToken: data.challenge_token,
                };
            }

            const user = parseUserResource(data.user);

            saveAuthSession({
                user_id: Number(user.id),
                user_name: user.username,
                user_email: user.email,
                user_avatar: user.avatar_urls?.thumb ?? null,
                token: data.token,
            });

            return { success: true, user, token: data.token };
        } catch (err: unknown) {
            return { success: false, error: captureIpcError('auth:login', err) };
        }
    });

    handle(
        'auth:twoFactorChallenge',
        async (_event, host: string, challengeToken: string, code: string | null, recoveryCode: string | null) => {
            const url = `${buildBaseUrl(host)}/api/v1/auth/two-factor-challenge`;
            try {
                const response = await net.fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                    body: JSON.stringify({
                        challenge_token: challengeToken,
                        code: code,
                        recovery_code: recoveryCode,
                    }),
                });

                const body = await response.json();

                if (!response.ok) {
                    return {
                        success: false,
                        error:
                            body.message ||
                            body.errors?.code?.[0] ||
                            body.errors?.recovery_code?.[0] ||
                            'Verification failed',
                    };
                }

                const data = body.data;
                const user = parseUserResource(data.user);

                saveAuthSession({
                    user_id: Number(user.id),
                    user_name: user.username,
                    user_email: user.email,
                    user_avatar: user.avatar_urls?.thumb ?? null,
                    token: data.token,
                });

                return { success: true, user, token: data.token };
            } catch (err: unknown) {
                return { success: false, error: captureIpcError('auth:twoFactorChallenge', err) };
            }
        },
    );

    handle('auth:validateInvite', async (_event, host: string, token: string) => {
        const url = `${buildBaseUrl(host)}/api/v1/auth/invite/${encodeURIComponent(token)}`;
        try {
            const response = await net.fetch(url, {
                method: 'GET',
                headers: { Accept: 'application/json' },
            });

            const body = await response.json();

            if (!response.ok) {
                return { success: false, error: body.message || 'Invalid invite link' };
            }

            return { success: true, data: body.data };
        } catch (err: unknown) {
            return { success: false, error: captureIpcError('auth:validateInvite', err) };
        }
    });

    handle(
        'auth:register',
        async (
            _event,
            host: string,
            inviteToken: string,
            username: string,
            email: string,
            password: string,
            passwordConfirmation: string,
        ) => {
            const url = `${buildBaseUrl(host)}/api/v1/auth/register`;
            try {
                const response = await net.fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                    body: JSON.stringify({
                        invite_token: inviteToken,
                        username,
                        email,
                        password,
                        password_confirmation: passwordConfirmation,
                        device_name: `LaraDisco Desktop (${process.platform})`,
                    }),
                });

                const body = await response.json();

                if (!response.ok) {
                    const errors: Record<string, string[]> = {};
                    if (Array.isArray(body.errors)) {
                        for (const err of body.errors) {
                            const pointer: string | undefined = err.source?.pointer;
                            const field = pointer?.replace(/^\/data\/attributes\//, '') ?? '_';
                            const message = err.detail ?? err.title;
                            if (!message) continue;
                            (errors[field] ??= []).push(message);
                        }
                    }
                    const firstError =
                        errors.invite_token?.[0] ||
                        errors.username?.[0] ||
                        errors.email?.[0] ||
                        errors.password?.[0] ||
                        errors.password_confirmation?.[0] ||
                        errors._?.[0] ||
                        body.message ||
                        'Registration failed';
                    return { success: false, error: firstError, errors };
                }

                const data = body.data;
                const user = parseUserResource(data.user);

                saveAuthSession({
                    user_id: Number(user.id),
                    user_name: user.username,
                    user_email: user.email,
                    user_avatar: user.avatar_urls?.thumb ?? null,
                    token: data.token,
                });

                return { success: true, user, token: data.token };
            } catch (err: unknown) {
                return { success: false, error: captureIpcError('auth:register', err) };
            }
        },
    );

    handle('auth:getSession', async () => {
        return getAuthSession();
    });

    handle('auth:logout', async (_event, host: string) => {
        const session = getAuthSession();
        if (session) {
            try {
                await net.fetch(`${buildBaseUrl(host)}/api/v1/auth/logout`, {
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${session.token}`,
                        Accept: 'application/json',
                    },
                });
            } catch (error) {
                console.error(error);
            }
            removeAuthSession();
        }
        return { success: true };
    });

    handle('auth:validate', async (_event, host: string, token: string) => {
        try {
            const response = await net.fetch(`${buildBaseUrl(host)}/api/v1/auth/me`, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'application/json',
                },
            });

            if (!response.ok) {
                return { valid: false };
            }

            const body = await response.json();
            const user = parseUserResource(body);
            return { valid: true, user };
        } catch {
            return { valid: false };
        }
    });

    handle('settings:get', async (_event, key: string) => {
        return getSetting(key);
    });

    handle('settings:set', async (_event, key: string, value: string) => {
        setSetting(key, value);
        return { success: true };
    });

    ipcMain.on('notifications:show', (event, payload: { title: string; body: string; notificationId: string }) => {
        if (!isTrustedSender(event as unknown as IpcMainInvokeEvent)) return;
        if (!Notification.isSupported()) return;

        const notification = new Notification({
            title: payload.title,
            body: payload.body,
        });

        notification.on('click', () => {
            const windows = BrowserWindow.getAllWindows();
            const win = windows[0];
            if (win) {
                if (win.isMinimized()) win.restore();
                win.focus();

                win.webContents.send('notifications:clicked', payload.notificationId);
            }
        });

        notification.show();
    });

    handle('avatar:resolve', async (_event, userId: string, url: string): Promise<string | null> => {
        if (!isAllowedServerUrl(url)) {
            // Not a host the user has connected to — refuse rather than fetch it.
            return null;
        }
        const key = await ensureAvatarCached(String(userId), url);
        return key ? `avatar://img/${key}` : null;
    });

    handle('avatar:forget', async (_event, userId: string): Promise<void> => {
        await forgetUser(String(userId));
    });

    handle('attachment:downloadBuffer', async (_event, url: string): Promise<Buffer> => {
        if (!isAllowedServerUrl(url)) {
            throw new Error('attachment:downloadBuffer: URL not in allowed servers');
        }
        const response = await net.fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to download attachment: HTTP ${response.status} ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    });

    handle(
        'video:prepare',
        async (
            _event,
            params: { attachmentId: string; downloadUrl: string; mimeType: string },
        ): Promise<PreparedVideoData> => {
            // Already prepared this session — read the cached file straight back.
            const cached = videoCache.get(params.attachmentId);
            if (cached) {
                return { data: new Uint8Array(await readFile(cached.filePath)), mimeType: cached.mimeType };
            }

            const inflight = videoPreparing.get(params.attachmentId);
            if (inflight) {
                return inflight;
            }

            if (!isAllowedServerUrl(params.downloadUrl)) {
                throw new Error('video:prepare: downloadUrl not in allowed servers');
            }

            const prepare = (async (): Promise<PreparedVideoData> => {
                const response = await net.fetch(params.downloadUrl);
                if (!response.ok) {
                    throw new Error(`Failed to download video: HTTP ${response.status} ${response.statusText}`);
                }
                const data = Buffer.from(await response.arrayBuffer());

                await mkdir(VIDEO_DIR, { recursive: true });
                const inputPath = join(VIDEO_DIR, `${params.attachmentId}-src${videoExtForMime(params.mimeType)}`);
                await writeFile(inputPath, data);

                let videoCodec = 'unknown';
                let pixFmt = '';
                let colorTransfer = '';
                try {
                    const { stdout } = await execFileAsync(
                        FFPROBE_PATH,
                        ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-select_streams', 'v:0', inputPath],
                        { maxBuffer: 10 * 1024 * 1024 },
                    );
                    const info = JSON.parse(stdout) as {
                        streams?: { codec_name?: string; pix_fmt?: string; color_transfer?: string }[];
                    };
                    const stream = info.streams?.[0];
                    videoCodec = stream?.codec_name ?? 'unknown';
                    pixFmt = stream?.pix_fmt ?? '';
                    colorTransfer = stream?.color_transfer ?? '';
                } catch (err) {
                    console.error('[video:prepare] ffprobe failed, will transcode defensively:', err);
                    videoCodec = 'unknown';
                }

                const is10bit = /10(?:le|be)|12(?:le|be)/.test(pixFmt);
                const isHdr = colorTransfer === 'smpte2084' || colorTransfer === 'arib-std-b67';
                const needsTranscode = !SUPPORTED_VIDEO_CODECS.has(videoCodec) || is10bit || isHdr;
                console.log(
                    `[video:prepare] codec=${videoCodec} pix_fmt=${pixFmt} color_transfer=${colorTransfer} needsTranscode=${needsTranscode}`,
                );

                if (!needsTranscode) {
                    videoCache.set(params.attachmentId, { filePath: inputPath, mimeType: params.mimeType });
                    return { data: new Uint8Array(data), mimeType: params.mimeType };
                }

                const outputPath = join(VIDEO_DIR, `${params.attachmentId}.webm`);
                try {
                    await execFileAsync(
                        FFMPEG_PATH,
                        [
                            '-y',
                            '-loglevel',
                            'error',
                            '-i',
                            inputPath,
                            '-c:v',
                            'libvpx-vp9',
                            '-pix_fmt',
                            'yuv420p',
                            '-vf',
                            'scale=trunc(iw/2)*2:trunc(ih/2)*2',
                            '-crf',
                            '33',
                            '-b:v',
                            '0',
                            '-deadline',
                            'realtime',
                            '-cpu-used',
                            '8',
                            '-c:a',
                            'libopus',
                            outputPath,
                        ],
                        { maxBuffer: 50 * 1024 * 1024 },
                    );
                } catch (err) {
                    await rm(inputPath, { force: true }).catch(() => {});
                    await rm(outputPath, { force: true }).catch(() => {});
                    throw new Error(`Failed to transcode video (codec=${videoCodec}): ${String(err)}`);
                }

                await rm(inputPath, { force: true }).catch(() => {});
                const out = await readFile(outputPath);
                console.log(`[video:prepare] transcode OK → VP9/WebM, ${out.length} bytes`);
                videoCache.set(params.attachmentId, { filePath: outputPath, mimeType: 'video/webm' });
                return { data: new Uint8Array(out), mimeType: 'video/webm' };
            })();

            videoPreparing.set(params.attachmentId, prepare);
            try {
                return await prepare;
            } finally {
                videoPreparing.delete(params.attachmentId);
            }
        },
    );

    handle('video:cleanup', async (_event, attachmentId: string): Promise<void> => {
        const entry = videoCache.get(attachmentId);
        videoCache.delete(attachmentId);
        videoPreparing.delete(attachmentId);
        if (entry) {
            await rm(entry.filePath, { force: true }).catch(() => {});
        }
    });

    handle(
        'video:generateThumbnail',
        async (
            _event,
            params: { fileData: Uint8Array; mimeType: string },
        ): Promise<{ dataUrl: string; width: number; height: number } | null> => {
            const tmpDir = await mkdtemp(join(tmpdir(), 'laradisco-vthumb-'));
            try {
                const inputPath = join(tmpDir, 'input');
                await writeFile(inputPath, Buffer.from(params.fileData));

                const outputPath = join(tmpDir, 'thumb.webp');

                let success = false;
                for (const seekArgs of [['-ss', '00:00:01'], [] as string[]]) {
                    try {
                        await execFileAsync(
                            FFMPEG_PATH,
                            [
                                '-y',
                                '-loglevel',
                                'error',
                                ...seekArgs,
                                '-i',
                                inputPath,
                                '-vframes',
                                '1',
                                '-vf',
                                'scale=300:-2,format=yuv420p',
                                outputPath,
                            ],
                            { maxBuffer: 10 * 1024 * 1024 },
                        );
                        success = true;
                        break;
                    } catch (ffErr) {
                        console.error('[video:generateThumbnail] ffmpeg attempt failed:', ffErr);
                    }
                }

                if (!success) return null;

                const thumbData = await readFile(outputPath);
                const meta = await sharp(thumbData).metadata();
                return {
                    dataUrl: `data:image/webp;base64,${thumbData.toString('base64')}`,
                    width: meta.width ?? 300,
                    height: meta.height ?? 0,
                };
            } catch (err) {
                console.error('[video:generateThumbnail]', err);
                return null;
            } finally {
                await rm(tmpDir, { recursive: true, force: true });
            }
        },
    );

    handle('unfurl:fetch', async (_event, url: string) => {
        try {
            const result = await unfurlUrl(url);
            if (result.status !== 'ok') {
                return { status: result.status, error: result.error };
            }
            return {
                status: 'ok',
                metadata: result.metadata,
                imageBytes: result.imageBytes ? new Uint8Array(result.imageBytes) : undefined,
                imageMime: result.imageMime,
                imageWidth: result.imageWidth,
                imageHeight: result.imageHeight,
            };
        } catch (err: unknown) {
            return { status: 'failed' as const, error: captureIpcError('unfurl:fetch', err) };
        }
    });

    handle(
        'attachment:generateThumbnail',
        async (
            _event,
            params: { fileData: Uint8Array; mimeType: string },
        ): Promise<{
            thumbnail: Uint8Array<ArrayBuffer>;
            size: number;
            width: number;
            height: number;
            format: string;
        } | null> => {
            if (!isImageMimeType(params.mimeType)) return null;

            const data = Buffer.from(params.fileData);
            const thumb = await generateThumbnail(data);

            return {
                thumbnail: new Uint8Array(thumb.thumbnail),
                size: thumb.thumbnail.length,
                width: thumb.width,
                height: thumb.height,
                format: thumb.format,
            };
        },
    );
}
