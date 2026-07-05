import { electronAPI } from '@electron-toolkit/preload';
import { contextBridge } from 'electron';
// Side-effect import: exposes window.__electronLog so electron-log/renderer can
// forward renderer logs to the main-process log file. Sandbox-safe (ipcRenderer only).
import 'electron-log/preload';

import { activityApi } from './apis/activity';
import { attachmentsApi } from './apis/attachments';
import { authApi } from './apis/auth';
import { avatarApi } from './apis/avatar';
import { clipboardApi } from './apis/clipboard';
import { idleApi } from './apis/idle';
import { logApi } from './apis/log';
import { notificationsApi } from './apis/notifications';
import { outboxApi } from './apis/outbox';
import { pttApi } from './apis/ptt';
import { serverApi } from './apis/server';
import { settingsApi } from './apis/settings';
import { soundboardApi } from './apis/soundboard';
import { trayApi } from './apis/tray';
import { unfurlApi } from './apis/unfurl';
import { updaterApi } from './apis/updater';
import { windowApi } from './apis/window';

const api = {
    server: serverApi,
    auth: authApi,
    ptt: pttApi,
    notifications: notificationsApi,
    settings: settingsApi,
    log: logApi,
    window: windowApi,
    updater: updaterApi,
    attachments: attachmentsApi,
    avatar: avatarApi,
    clipboard: clipboardApi,
    unfurl: unfurlApi,
    tray: trayApi,
    activity: activityApi,
    soundboard: soundboardApi,
    idle: idleApi,
    outbox: outboxApi,
};

if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld('electron', electronAPI);
        contextBridge.exposeInMainWorld('api', api);
    } catch (error) {
        console.error(error);
    }
} else {
    // @ts-expect-error (define in dts)
    window.electron = electronAPI;
    // @ts-expect-error (define in dts)
    window.api = api;
}
