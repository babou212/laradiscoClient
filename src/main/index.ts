import { join } from 'path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { app, BrowserWindow, desktopCapturer, ipcMain, protocol, session, shell } from 'electron';

if (process.env.USER_DATA_DIR) {
    app.setPath('userData', process.env.USER_DATA_DIR);
}

app.commandLine.appendSwitch(
    'enable-features',
    ['VaapiVideoDecodeLinuxGL', 'VaapiVideoDecoder', 'PlatformHEVCDecoderSupport', 'VideoToolboxVideoDecoder'].join(
        ',',
    ),
);
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

protocol.registerSchemesAsPrivileged([
    { scheme: 'app-video', privileges: { secure: true, supportFetchAPI: true, bypassCSP: true, stream: true } },
]);

import { initDatabase } from './database';
import { registerIpcHandlers, getVideoCache } from './ipc';
import { initMls } from './mls';
import { cleanupPushToTalk, initPushToTalk } from './ptt';
import { initAutoUpdater } from './updater';

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.exit(0);
}

let mainWindow: BrowserWindow | null = null;

function registerWindowIpcHandlers(): void {
    ipcMain.on('window:minimize', () => mainWindow?.minimize());
    ipcMain.on('window:maximize', () => {
        if (!mainWindow) return;
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    });
    ipcMain.on('window:close', () => mainWindow?.close());
    ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);
}

function createWindow(): void {
    const isMac = process.platform === 'darwin';

    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 960,
        minHeight: 600,
        show: false,
        autoHideMenuBar: true,

        ...(isMac ? { titleBarStyle: 'hiddenInset' } : { frame: false }),
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow = win;

    win.on('maximize', () => {
        if (!win.webContents.isDestroyed()) {
            win.webContents.send('window:maximized-change', true);
        }
    });
    win.on('unmaximize', () => {
        if (!win.webContents.isDestroyed()) {
            win.webContents.send('window:maximized-change', false);
        }
    });

    win.on('ready-to-show', () => {
        win.show();
    });

    win.on('close', () => {
        if (!win.webContents.isDestroyed()) {
            win.webContents.send('app:before-quit');
        }
    });

    win.on('closed', () => {
        if (mainWindow === win) {
            mainWindow = null;
        }
    });

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        win.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
        win.loadFile(join(__dirname, '../renderer/index.html'));
    }
}

app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
        if (win.isMinimized()) win.restore();
        win.focus();
    }
});

app.whenReady().then(() => {
    initDatabase();
    registerIpcHandlers();
    registerWindowIpcHandlers();
    initMls();
    initPushToTalk();
    initAutoUpdater();

    session.defaultSession.protocol.handle('app-video', (request) => {
        const attachmentId = new URL(request.url).hostname;
        const entry = getVideoCache(attachmentId);
        if (!entry) {
            return new Response(null, { status: 404 });
        }

        const rangeHeader = request.headers.get('Range');
        if (rangeHeader) {
            const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
            if (match) {
                const start = parseInt(match[1], 10);
                const end = match[2] ? parseInt(match[2], 10) : entry.data.length - 1;
                const chunk = entry.data.subarray(start, end + 1);
                return new Response(new Uint8Array(chunk), {
                    status: 206,
                    headers: {
                        'Content-Type': entry.mimeType,
                        'Content-Range': `bytes ${start}-${end}/${entry.data.length}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': String(chunk.length),
                    },
                });
            }
        }

        return new Response(new Uint8Array(entry.data), {
            status: 200,
            headers: {
                'Content-Type': entry.mimeType,
                'Accept-Ranges': 'bytes',
                'Content-Length': String(entry.data.length),
            },
        });
    });

    electronApp.setAppUserModelId('com.laradisco.client');

    const defaultUserAgent = session.defaultSession.getUserAgent();
    const cleanUserAgent = defaultUserAgent.replace(/\s*Electron\/[\w.]+/gi, '').replace(/\s*laradisco[^\s]*/gi, '');
    session.defaultSession.webRequest.onBeforeSendHeaders(
        {
            urls: [
                'https://*.youtube.com/*',
                'https://*.youtube-nocookie.com/*',
                'https://*.googlevideo.com/*',
                'https://*.google.com/*',
            ],
        },
        (details, callback) => {
            details.requestHeaders['User-Agent'] = cleanUserAgent;
            callback({ requestHeaders: details.requestHeaders });
        },
    );

    const csp = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "connect-src 'self' http: https: ws: wss:",
        "img-src 'self' data: http: https: blob:",
        "font-src 'self' data:",
        "media-src 'self' blob: data: https: app-video:",
        'frame-src blob: https://www.youtube.com https://www.youtube-nocookie.com',
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ].join('; ');

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const url = new URL(details.url);
        const isAppPage = url.protocol === 'file:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1';

        if (isAppPage) {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Content-Security-Policy': [csp],
                    'X-Content-Type-Options': ['nosniff'],
                    'X-Frame-Options': ['DENY'],
                    'Referrer-Policy': ['strict-origin-when-cross-origin'],
                    'Permissions-Policy': ['microphone=self, camera=(), geolocation=(), payment=(), usb=(), serial=()'],
                },
            });
        } else {
            callback({ responseHeaders: details.responseHeaders });
        }
    });

    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
        const allowed = ['media', 'mediaKeySystem', 'display-capture'];
        callback(allowed.includes(permission));
    });

    session.defaultSession.setDisplayMediaRequestHandler(
        async (_request, callback) => {
            const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
            if (sources.length > 0) {
                callback({ video: sources[0] });
            } else {
                callback(null as unknown as Electron.Streams);
            }
        },
        { useSystemPicker: true },
    );

    app.on('web-contents-created', (_event, contents) => {
        contents.on('will-navigate', (event, url) => {
            const appOrigins = ['http://localhost', process.env['ELECTRON_RENDERER_URL'] ?? ''];
            const isAllowed = appOrigins.some((o) => o && url.startsWith(o));
            if (!isAllowed && !url.startsWith('file://')) {
                event.preventDefault();
                shell.openExternal(url);
            }
        });

        contents.on('will-attach-webview', (event) => {
            event.preventDefault();
        });

        contents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url);
            return { action: 'deny' };
        });
    });

    app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window);
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    cleanupPushToTalk();
});
