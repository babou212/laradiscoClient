import type { ElectronAPI } from '@electron-toolkit/preload';

export type { AttachmentsApi } from './types/attachments';
export type { AvatarApi } from './types/avatar';
export type { ClipboardApi } from './types/clipboard';
export type { ServerConnection, ServerApi } from './types/server';
export type { AuthPermissions, AuthUser, AuthSession, AuthApi } from './types/auth';
export type { PttBinding, PttModifiers, PttCapture, PttApi } from './types/ptt';
export type { NotificationsApi } from './types/notifications';
export type { SettingsApi } from './types/settings';
export type { LogApi, LogSaveResult } from './types/log';
export type { WindowApi } from './types/window';
export type { UpdaterApi } from './types/updater';
export type { TrayApi } from './types/tray';
export type { LinkPreviewMetadata, UnfurlResponse, UnfurlApi } from './types/unfurl';
export type { ClientActivity, ClientActivityType, ActivityApi } from './types/activity';
export type { SoundboardApi } from './types/soundboard';
export type { IdleApi } from './types/idle';
export type { OutboxApi, OutboxRow } from './types/outbox';

import type { ActivityApi } from './types/activity';
import type { AttachmentsApi } from './types/attachments';
import type { AuthApi } from './types/auth';
import type { AvatarApi } from './types/avatar';
import type { ClipboardApi } from './types/clipboard';
import type { IdleApi } from './types/idle';
import type { LogApi } from './types/log';
import type { NotificationsApi } from './types/notifications';
import type { OutboxApi } from './types/outbox';
import type { PttApi } from './types/ptt';
import type { ServerApi } from './types/server';
import type { SettingsApi } from './types/settings';
import type { SoundboardApi } from './types/soundboard';
import type { TrayApi } from './types/tray';
import type { UnfurlApi } from './types/unfurl';
import type { UpdaterApi } from './types/updater';
import type { WindowApi } from './types/window';

interface AppApi {
    server: ServerApi;
    auth: AuthApi;
    ptt: PttApi;
    notifications: NotificationsApi;
    settings: SettingsApi;
    log: LogApi;
    window: WindowApi;
    updater: UpdaterApi;
    attachments: AttachmentsApi;
    avatar: AvatarApi;
    clipboard: ClipboardApi;
    unfurl: UnfurlApi;
    tray: TrayApi;
    activity: ActivityApi;
    soundboard: SoundboardApi;
    idle: IdleApi;
    outbox: OutboxApi;
}

declare global {
    interface Window {
        electron: ElectronAPI;
        api: AppApi;
    }
}
