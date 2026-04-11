import type { ElectronAPI } from '@electron-toolkit/preload';

export type { AttachmentsApi } from './types/attachments';
export type { ClipboardApi } from './types/clipboard';
export type { ServerConnection, ServerApi } from './types/server';
export type { AuthPermissions, AuthUser, AuthSession, AuthApi } from './types/auth';
export type { PttCapturedKey, PttApi } from './types/ptt';
export type { NotificationsApi } from './types/notifications';
export type { ScreenSource, ScreenApi } from './types/screen';
export type { SettingsApi } from './types/settings';
export type { WindowApi } from './types/window';
export type { UpdaterApi } from './types/updater';
export type { MlsSetupResult, MlsKeyBackup, MlsGroupInfo, MlsApi } from './types/mls';
export type { SearchResult, MessagesApi } from './types/messages';
export type { LinkPreviewMetadata, UnfurlResponse, UnfurlApi } from './types/unfurl';

import type { AttachmentsApi } from './types/attachments';
import type { AuthApi } from './types/auth';
import type { ClipboardApi } from './types/clipboard';
import type { MessagesApi } from './types/messages';
import type { MlsApi } from './types/mls';
import type { NotificationsApi } from './types/notifications';
import type { PttApi } from './types/ptt';
import type { ScreenApi } from './types/screen';
import type { ServerApi } from './types/server';
import type { SettingsApi } from './types/settings';
import type { UnfurlApi } from './types/unfurl';
import type { UpdaterApi } from './types/updater';
import type { WindowApi } from './types/window';

interface AppApi {
    server: ServerApi;
    auth: AuthApi;
    ptt: PttApi;
    notifications: NotificationsApi;
    screen: ScreenApi;
    settings: SettingsApi;
    window: WindowApi;
    updater: UpdaterApi;
    mls: MlsApi;
    messages: MessagesApi;
    attachments: AttachmentsApi;
    clipboard: ClipboardApi;
    unfurl: UnfurlApi;
}

declare global {
    interface Window {
        electron: ElectronAPI;
        api: AppApi;
    }
}
