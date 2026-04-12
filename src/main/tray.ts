import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import type { BrowserWindow } from 'electron';
import { app, ipcMain, Menu, nativeImage, Tray } from 'electron';

let tray: Tray | null = null;
let isQuitting = false;

export function getIsQuitting(): boolean {
    return isQuitting;
}

export function setIsQuitting(value: boolean): void {
    isQuitting = value;
}

function getTrayIconPath(): string {
    const basePath = is.dev ? join(__dirname, '../../build/tray') : join(process.resourcesPath, 'tray');

    if (process.platform === 'darwin') {
        return join(basePath, 'iconTemplate.png');
    }
    if (process.platform === 'win32') {
        return join(basePath, 'icon-win.png');
    }
    return join(basePath, 'icon.png');
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
    const iconPath = getTrayIconPath();
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon);
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
