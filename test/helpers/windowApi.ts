import { vi } from 'vitest';

type AppApi = Window['api'];

type DeepPartial<T> = {
    [K in keyof T]?: T[K] extends (...args: infer A) => infer R ? (...args: A) => R : DeepPartial<T[K]>;
};

/**
 * Build a fully-stubbed `window.api`, typed against the real preload `AppApi`
 * surface so it breaks at compile time when the bridge changes. Every method is
 * a `vi.fn()` with a benign default; pass `overrides` to replace specific
 * methods per test (e.g. `{ auth: { login: vi.fn().mockResolvedValue(...) } }`).
 */
export function createWindowApiMock(overrides: DeepPartial<AppApi> = {}): AppApi {
    const base: AppApi = {
        server: {
            ping: vi.fn().mockResolvedValue({ success: true }),
            save: vi.fn().mockResolvedValue({ success: true }),
            getActive: vi.fn().mockResolvedValue(null),
            getAll: vi.fn().mockResolvedValue([]),
            setActive: vi.fn().mockResolvedValue({ success: true }),
            remove: vi.fn().mockResolvedValue({ success: true }),
        },
        auth: {
            login: vi.fn().mockResolvedValue({ success: false }),
            twoFactorChallenge: vi.fn().mockResolvedValue({ success: false }),
            getSession: vi.fn().mockResolvedValue(null),
            logout: vi.fn().mockResolvedValue({ success: true }),
            validate: vi.fn().mockResolvedValue({ valid: false }),
            validateInvite: vi.fn().mockResolvedValue({ success: true }),
            register: vi.fn().mockResolvedValue({ success: false }),
        },
        ptt: {
            configure: vi.fn().mockResolvedValue({ success: true }),
            captureNextKey: vi.fn().mockResolvedValue({
                device: 'keyboard',
                keycode: 0,
                ctrlKey: false,
                shiftKey: false,
                altKey: false,
                metaKey: false,
            }),
            cancelCapture: vi.fn().mockResolvedValue({ success: true }),
            linuxInputStatus: vi.fn().mockResolvedValue({ supported: false, hasAccess: true, ruleInstalled: false }),
            setupLinuxInputAccess: vi.fn().mockResolvedValue({ status: 'installed', hasAccess: true }),
            onActivated: vi.fn(),
            onDeactivated: vi.fn(),
            removeAllListeners: vi.fn(),
        },
        notifications: {
            show: vi.fn(),
            onClicked: vi.fn(),
            removeAllListeners: vi.fn(),
        },
        settings: {
            get: vi.fn().mockResolvedValue(null),
            set: vi.fn().mockResolvedValue({ success: true }),
        },
        log: {
            getPath: vi.fn().mockResolvedValue('/tmp/laradisco.log'),
            reveal: vi.fn().mockResolvedValue({ success: true }),
            save: vi.fn().mockResolvedValue({ success: true }),
        },
        window: {
            minimize: vi.fn(),
            maximize: vi.fn(),
            close: vi.fn(),
            isMaximized: vi.fn().mockResolvedValue(false),
            onMaximizedChange: vi.fn(),
            removeMaximizedListener: vi.fn(),
            onBeforeQuit: vi.fn(),
            removeBeforeQuitListener: vi.fn(),
            platform: 'linux',
        },
        updater: {
            getVersion: vi.fn().mockResolvedValue('0.0.0-test'),
            check: vi.fn().mockResolvedValue({ success: true }),
            download: vi.fn().mockResolvedValue({ success: true }),
            install: vi.fn(),
            onUpdateAvailable: vi.fn(),
            onUpToDate: vi.fn(),
            onDownloadProgress: vi.fn(),
            onUpdateDownloaded: vi.fn(),
            onError: vi.fn(),
            removeAllListeners: vi.fn(),
        },
        attachments: {
            downloadBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
            prepareVideo: vi.fn().mockResolvedValue({ data: new Uint8Array(), mimeType: 'video/mp4' }),
            cleanupVideo: vi.fn().mockResolvedValue(undefined),
            generateVideoThumbnail: vi.fn().mockResolvedValue(null),
            generateThumbnail: vi.fn().mockResolvedValue(null),
        },
        avatar: {
            resolve: vi.fn().mockResolvedValue(null),
            forget: vi.fn().mockResolvedValue(undefined),
        },
        clipboard: {
            readText: vi.fn().mockResolvedValue(''),
            writeText: vi.fn(),
        },
        unfurl: {
            fetch: vi.fn().mockResolvedValue({ status: 'failed', error: 'not-mocked' }),
        },
        tray: {
            updateUnreadCount: vi.fn(),
            updateMuteState: vi.fn(),
            onMuteToggled: vi.fn(),
            removeAllListeners: vi.fn(),
        },
        activity: {
            onChanged: vi.fn(),
            removeChangedListeners: vi.fn(),
            setEnabled: vi.fn().mockResolvedValue({ success: true }),
            getCurrent: vi.fn().mockResolvedValue(null),
        },
        soundboard: {
            trim: vi.fn().mockResolvedValue({ data: new Uint8Array(), mimeType: 'audio/ogg' }),
        },
        outbox: {
            enqueue: vi.fn().mockResolvedValue({ success: true }),
            remove: vi.fn().mockResolvedValue({ success: true }),
            listForChannel: vi.fn().mockResolvedValue([]),
            get: vi.fn().mockResolvedValue(null),
        },
    };

    for (const key of Object.keys(overrides) as (keyof AppApi)[]) {
        Object.assign(base[key] as object, overrides[key]);
    }
    return base;
}
