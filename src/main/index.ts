import { join } from 'path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { app, BrowserWindow, ipcMain, session, shell } from 'electron';

if (process.env.USER_DATA_DIR) {
    app.setPath('userData', process.env.USER_DATA_DIR);
}

import { initE2ee } from './crypto';
import { initDatabase } from './database';
import { registerIpcHandlers } from './ipc';
import { cleanupPushToTalk, initPushToTalk } from './ptt';
import { initAutoUpdater } from './updater';

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}

function createWindow(): void {
    const isMac = process.platform === 'darwin';

    const mainWindow = new BrowserWindow({
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

    ipcMain.on('window:minimize', () => mainWindow.minimize());
    ipcMain.on('window:maximize', () => {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    });
    ipcMain.on('window:close', () => mainWindow.close());
    ipcMain.handle('window:isMaximized', () => mainWindow.isMaximized());

    mainWindow.on('maximize', () => {
        mainWindow.webContents.send('window:maximized-change', true);
    });
    mainWindow.on('unmaximize', () => {
        mainWindow.webContents.send('window:maximized-change', false);
    });

    mainWindow.on('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('close', () => {
        mainWindow.webContents.send('app:before-quit');
    });

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
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
    initE2ee();
    initPushToTalk();
    initAutoUpdater();

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
        "media-src 'self' blob: https:",
        'frame-src https://www.youtube.com https://www.youtube-nocookie.com',
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
        const allowed = ['media', 'mediaKeySystem'];
        callback(allowed.includes(permission));
    });

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
    cleanupPushToTalk();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
