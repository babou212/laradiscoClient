import { tmpdir } from 'os';
import { vi } from 'vitest';

export const app = {
    getPath: vi.fn((name: string) => (name === 'userData' ? tmpdir() : tmpdir())),
    getVersion: vi.fn(() => '0.0.0-test'),
    getName: vi.fn(() => 'laradisco-client'),
    isPackaged: false,
    on: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
    quit: vi.fn(),
};

export const ipcMain = {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
};

export const BrowserWindow = Object.assign(vi.fn(), {
    getAllWindows: vi.fn(() => [] as unknown[]),
    fromWebContents: vi.fn(() => null),
});

export const safeStorage = {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((s: string) => Buffer.from(s, 'utf8')),
    decryptString: vi.fn((b: Buffer) => b.toString('utf8')),
};

export const net = {
    fetch: vi.fn(),
};

export const shell = {
    openExternal: vi.fn(),
    showItemInFolder: vi.fn(),
};

export const dialog = {
    showSaveDialog: vi.fn(),
    showMessageBox: vi.fn(),
};

export const nativeImage = {
    createFromBuffer: vi.fn(() => ({ resize: vi.fn(), toPNG: vi.fn() })),
    createFromPath: vi.fn(() => ({ resize: vi.fn(), isEmpty: () => true })),
};

export const Notification = Object.assign(
    vi.fn(() => ({ show: vi.fn(), on: vi.fn() })),
    { isSupported: vi.fn(() => true) },
);

export const Tray = vi.fn(() => ({
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    on: vi.fn(),
    setImage: vi.fn(),
}));

export const Menu = Object.assign(vi.fn(), {
    buildFromTemplate: vi.fn(() => ({})),
    setApplicationMenu: vi.fn(),
});

export const powerMonitor = { on: vi.fn() };

export default {
    app,
    ipcMain,
    BrowserWindow,
    safeStorage,
    net,
    shell,
    dialog,
    nativeImage,
    Notification,
    Tray,
    Menu,
    powerMonitor,
};
