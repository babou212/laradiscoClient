import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import * as Sentry from '@sentry/electron/main';
import { BrowserWindow, ipcMain, net, Notification, type IpcMainInvokeEvent } from 'electron';
import sharp from 'sharp';
import { encryptFile, decryptFile } from './crypto/file-encryption';

function captureIpcError(channel: string, err: unknown): string {
    const error = err instanceof Error ? err : new Error(String(err));
    Sentry.withScope((scope) => {
        scope.setTag('ipc.channel', channel);
        scope.setFingerprint(['ipc-error', channel]);
        Sentry.captureException(error);
    });
    return error.message;
}

// Only frames loaded from the app's own origins may invoke IPC. Defence-in-depth
// per https://www.electronjs.org/docs/latest/tutorial/security (validate sender).
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

// Allowlist for outbound fetches initiated via renderer-supplied URLs. Only
// hosts the user has explicitly connected to (stored in the server DB) are
// permitted, which blocks SSRF / internal-network probing via these handlers.
function isAllowedServerUrl(raw: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return false;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

    const servers = getAllServers();
    return servers.some((s) => {
        const host = s.host.replace(/^https?:\/\//, '').replace(/\/+$/, '');
        const [hostname, port] = host.split(':');
        if (parsed.hostname !== hostname) return false;
        if (port && parsed.port && parsed.port !== port) return false;
        return true;
    });
}

const execFileAsync = promisify(execFile);

const SUPPORTED_VIDEO_CODECS = new Set(['h264', 'vp8', 'vp9', 'theora', 'mpeg4', 'mp4v', 'mpeg2video']);

const videoCache = new Map<string, { data: Buffer; mimeType: string }>();
const videoPreparing = new Map<string, Promise<string>>();

export function getVideoCache(attachmentId: string): { data: Buffer; mimeType: string } | undefined {
    return videoCache.get(attachmentId);
}

import {
    addServerConnection,
    getActiveServer,
    getAllServers,
    getAuthSession,
    getSetting,
    removeAuthSession,
    removeServer,
    saveAuthSession,
    setActiveServer,
    setSetting,
    storeDecryptedMessage,
    storeDecryptedMessageIfAbsent,
    getDecryptedMessages,
    indexMessageForSearch,
    removeMessageFromSearchIndex,
    searchMessages,
    clearSearchIndex,
} from './database';
import { generateThumbnail, isImageMimeType } from './media/thumbnails';
import { unfurlUrl } from './services/unfurl';

interface AuthUser {
    id: string;
    name: string;
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
        name: attrs.name as string,
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
            const connection = addServerConnection(name, host);
            return { success: true, connection };
        } catch (err: unknown) {
            return { success: false, error: captureIpcError('server:save', err) };
        }
    });

    handle('server:getActive', async () => {
        return getActiveServer();
    });

    handle('server:getAll', async () => {
        return getAllServers();
    });

    handle('server:setActive', async (_event, id: number) => {
        setActiveServer(id);
        return { success: true };
    });

    handle('server:remove', async (_event, id: number) => {
        removeServer(id);
        return { success: true };
    });

    handle('auth:login', async (_event, host: string, serverId: number, email: string, password: string) => {
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

            saveAuthSession(
                serverId,
                Number(user.id),
                user.name,
                user.email,
                user.avatar_urls?.thumb ?? null,
                data.token,
            );

            return { success: true, user, token: data.token };
        } catch (err: unknown) {
            return { success: false, error: captureIpcError('auth:login', err) };
        }
    });

    handle(
        'auth:twoFactorChallenge',
        async (
            _event,
            host: string,
            serverId: number,
            challengeToken: string,
            code: string | null,
            recoveryCode: string | null,
        ) => {
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

                saveAuthSession(
                    serverId,
                    Number(user.id),
                    user.name,
                    user.email,
                    user.avatar_urls?.thumb ?? null,
                    data.token,
                );

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
            serverId: number,
            inviteToken: string,
            name: string,
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
                        name,
                        username,
                        email,
                        password,
                        password_confirmation: passwordConfirmation,
                        device_name: `LaraDisco Desktop (${process.platform})`,
                    }),
                });

                const body = await response.json();

                if (!response.ok) {
                    const errors = body.errors ?? {};
                    const firstError =
                        errors.invite_token?.[0] ||
                        errors.name?.[0] ||
                        errors.username?.[0] ||
                        errors.email?.[0] ||
                        errors.password?.[0] ||
                        body.message ||
                        'Registration failed';
                    return { success: false, error: firstError, errors };
                }

                const data = body.data;
                const user = parseUserResource(data.user);

                saveAuthSession(
                    serverId,
                    Number(user.id),
                    user.name,
                    user.email,
                    user.avatar_urls?.thumb ?? null,
                    data.token,
                );

                return { success: true, user, token: data.token };
            } catch (err: unknown) {
                return { success: false, error: captureIpcError('auth:register', err) };
            }
        },
    );

    handle('auth:getSession', async (_event, serverId: number) => {
        return getAuthSession(serverId);
    });

    handle('auth:logout', async (_event, host: string, serverId: number) => {
        const session = getAuthSession(serverId);
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
            removeAuthSession(serverId);
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

    handle('messages:storeDecrypted', async (_event, serverId: number, messageId: number, plaintext: string) => {
        storeDecryptedMessage(serverId, messageId, plaintext);
    });

    handle(
        'messages:storeDecryptedIfAbsent',
        async (_event, serverId: number, messageId: number, plaintext: string) => {
            storeDecryptedMessageIfAbsent(serverId, messageId, plaintext);
        },
    );

    handle('messages:getDecryptedBatch', async (_event, serverId: number, messageIds: number[]) => {
        const map = getDecryptedMessages(serverId, messageIds);
        return Object.fromEntries(map);
    });

    handle(
        'messages:indexForSearch',
        async (
            _event,
            params: {
                serverId: number;
                messageId: number;
                conversationType: 'channel' | 'dm';
                conversationId: number;
                userName: string;
                plaintext: string;
            },
        ) => {
            indexMessageForSearch(params);
        },
    );

    handle('messages:removeFromSearchIndex', async (_event, serverId: number, messageId: number) => {
        removeMessageFromSearchIndex(serverId, messageId);
    });

    handle(
        'messages:searchLocal',
        async (
            _event,
            params: {
                serverId: number;
                conversationType: 'channel' | 'dm';
                conversationId: number;
                query: string;
                limit?: number;
                offset?: number;
            },
        ) => {
            return searchMessages(
                params.serverId,
                params.conversationType,
                params.conversationId,
                params.query,
                params.limit ?? 50,
                params.offset ?? 0,
            );
        },
    );

    handle('messages:clearSearchIndex', async (_event, serverId: number) => {
        clearSearchIndex(serverId);
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

    handle(
        'attachment:encrypt',
        async (
            _event,
            fileData: Uint8Array,
        ): Promise<{ encrypted: Uint8Array<ArrayBuffer>; key: string; iv: string; size: number }> => {
            const data = Buffer.from(fileData);
            const result = encryptFile(data);
            return {
                encrypted: new Uint8Array(result.encrypted),
                key: result.key,
                iv: result.iv,
                size: result.encrypted.length,
            };
        },
    );

    handle(
        'attachment:decryptBuffer',
        async (_event, params: { encryptedBase64: string; key: string; iv: string }): Promise<string> => {
            const encrypted = Buffer.from(params.encryptedBase64, 'base64');
            const decrypted = decryptFile(encrypted, params.key, params.iv);
            return decrypted.toString('base64');
        },
    );

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
            params: { attachmentId: string; downloadUrl: string; key: string; iv: string; mimeType: string },
        ): Promise<string> => {
            if (videoCache.has(params.attachmentId)) {
                return `app-video://${params.attachmentId}`;
            }

            const inflight = videoPreparing.get(params.attachmentId);
            if (inflight) {
                return inflight;
            }

            if (!isAllowedServerUrl(params.downloadUrl)) {
                throw new Error('video:prepare: downloadUrl not in allowed servers');
            }

            const prepare = (async (): Promise<string> => {
                const response = await net.fetch(params.downloadUrl);
                if (!response.ok) {
                    throw new Error(`Failed to download video: HTTP ${response.status} ${response.statusText}`);
                }
                const encrypted = Buffer.from(await response.arrayBuffer());
                let data = decryptFile(encrypted, params.key, params.iv);
                let mimeType = params.mimeType;

                const tmpDir = await mkdtemp(join(tmpdir(), 'laradisco-vid-'));
                try {
                    const inputPath = join(tmpDir, 'input');
                    await writeFile(inputPath, data);

                    let videoCodec = 'unknown';
                    let pixFmt = '';
                    let colorTransfer = '';
                    try {
                        const { stdout } = await execFileAsync(
                            'ffprobe',
                            [
                                '-v',
                                'quiet',
                                '-print_format',
                                'json',
                                '-show_streams',
                                '-select_streams',
                                'v:0',
                                inputPath,
                            ],
                            { maxBuffer: 10 * 1024 * 1024 },
                        );
                        const info = JSON.parse(stdout) as {
                            streams?: { codec_name?: string; pix_fmt?: string; color_transfer?: string }[];
                        };
                        const stream = info.streams?.[0];
                        videoCodec = stream?.codec_name ?? 'unknown';
                        pixFmt = stream?.pix_fmt ?? '';
                        colorTransfer = stream?.color_transfer ?? '';
                    } catch {
                        videoCodec = 'unknown';
                    }

                    const is10bit = /10(?:le|be)|12(?:le|be)/.test(pixFmt);
                    const isHdr = colorTransfer === 'smpte2084' || colorTransfer === 'arib-std-b67';
                    const needsTranscode = !SUPPORTED_VIDEO_CODECS.has(videoCodec) || is10bit || isHdr;
                    console.log(
                        `[video:prepare] codec=${videoCodec} pix_fmt=${pixFmt} color_transfer=${colorTransfer} needsTranscode=${needsTranscode}`,
                    );

                    if (needsTranscode) {
                        const outputPath = join(tmpDir, 'output.webm');
                        await execFileAsync(
                            'ffmpeg',
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
                        data = await readFile(outputPath);
                        mimeType = 'video/webm';
                        console.log(`[video:prepare] transcode OK → VP9/WebM, output size=${data.length} bytes`);
                    }
                } catch (err) {
                    console.error('[video:prepare] Transcoding failed, serving original:', err);
                } finally {
                    await rm(tmpDir, { recursive: true, force: true });
                }

                videoCache.set(params.attachmentId, { data, mimeType });
                return `app-video://${params.attachmentId}`;
            })();

            videoPreparing.set(params.attachmentId, prepare);
            try {
                return await prepare;
            } finally {
                videoPreparing.delete(params.attachmentId);
            }
        },
    );

    handle('video:cleanup', (_event, attachmentId: string): void => {
        videoCache.delete(attachmentId);
        videoPreparing.delete(attachmentId);
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
                            'ffmpeg',
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
            thumbnailEncrypted: Uint8Array<ArrayBuffer>;
            thumbnailKey: string;
            thumbnailIv: string;
            thumbnailSize: number;
            width: number;
            height: number;
            format: string;
        } | null> => {
            if (!isImageMimeType(params.mimeType)) return null;

            const data = Buffer.from(params.fileData);
            const thumb = await generateThumbnail(data);
            const encrypted = encryptFile(thumb.thumbnail);

            return {
                thumbnailEncrypted: new Uint8Array(encrypted.encrypted),
                thumbnailKey: encrypted.key,
                thumbnailIv: encrypted.iv,
                thumbnailSize: encrypted.encrypted.length,
                width: thumb.width,
                height: thumb.height,
                format: thumb.format,
            };
        },
    );
}
