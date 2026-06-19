import type { BrowserWindow } from 'electron';
import { app, ipcMain, Menu, nativeImage, Tray } from 'electron';
import appIcon from '../../resources/icon.png?asset';

let tray: Tray | null = null;
let isQuitting = false;

export function getIsQuitting(): boolean {
    return isQuitting;
}

export function setIsQuitting(value: boolean): void {
    isQuitting = value;
}

// Build the tray icon from the same app icon, downscaled to tray size with a
// @2x representation so it stays crisp on hi-dpi/retina displays.
function getTrayIcon(): Electron.NativeImage {
    const src = nativeImage.createFromPath(appIcon);
    const icon = nativeImage.createEmpty();
    icon.addRepresentation({ scaleFactor: 1, buffer: src.resize({ width: 16, height: 16 }).toPNG() });
    icon.addRepresentation({ scaleFactor: 2, buffer: src.resize({ width: 32, height: 32 }).toPNG() });
    return icon;
}

function buildContextMenu(win: BrowserWindow | null, isMuted: boolean): Menu {
    return Menu.buildFromTemplate([
        {
            label: 'Show LaraDisco',
            click: (): void => {
                if (win && !win.isDestroyed()) {
                    win.show();
                    win.focus();
                }
            },
        },
        { type: 'separator' },
        {
            label: 'Mute Notifications',
            type: 'checkbox',
            checked: isMuted,
            click: (menuItem): void => {
                if (win && !win.isDestroyed()) {
                    win.webContents.send('tray:mute-toggled', menuItem.checked);
                }
            },
        },
        { type: 'separator' },
        {
            label: 'Quit LaraDisco',
            click: (): void => {
                isQuitting = true;
                app.quit();
            },
        },
    ]);
}

function updateBadge(win: BrowserWindow | null, count: number): void {
    if (process.platform === 'darwin') {
        app.dock?.setBadge(count > 0 ? String(count) : '');
        if (tray) {
            tray.setTitle(count > 0 ? String(count) : '');
        }
    } else if (process.platform === 'win32' && win && !win.isDestroyed()) {
        if (count > 0) {
            const badgeSize = 16;
            const canvas = `<svg xmlns="http://www.w3.org/2000/svg" width="${badgeSize}" height="${badgeSize}">
                <circle cx="${badgeSize / 2}" cy="${badgeSize / 2}" r="${badgeSize / 2}" fill="#EF4444"/>
                <text x="${badgeSize / 2}" y="${badgeSize / 2 + 4}" text-anchor="middle" fill="white" font-size="10" font-family="sans-serif">${count > 9 ? '9+' : count}</text>
            </svg>`;
            const overlay = nativeImage.createFromBuffer(Buffer.from(canvas));
            win.setOverlayIcon(overlay, `${count} unread`);
        } else {
            win.setOverlayIcon(null, '');
        }
    } else {
        app.setBadgeCount(count);
    }
}

export function initTray(win: BrowserWindow): void {
    tray = new Tray(getTrayIcon());
    tray.setToolTip('LaraDisco');

    let isMuted = false;
    tray.setContextMenu(buildContextMenu(win, isMuted));

    if (process.platform !== 'linux') {
        tray.on('click', () => {
            if (win && !win.isDestroyed()) {
                if (win.isVisible()) {
                    win.focus();
                } else {
                    win.show();
                    win.focus();
                }
            }
        });
    }

    ipcMain.on('tray:update-unread-count', (_event, count: number) => {
        updateBadge(win, count);
    });

    ipcMain.on('tray:update-mute-state', (_event, muted: boolean) => {
        isMuted = muted;
        tray?.setContextMenu(buildContextMenu(win, isMuted));
    });
}
