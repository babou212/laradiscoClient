import { electronAPI } from '@electron-toolkit/preload';
import { contextBridge } from 'electron';

import { attachmentsApi } from './apis/attachments';
import { authApi } from './apis/auth';
import { clipboardApi } from './apis/clipboard';
import { messagesApi } from './apis/messages';
import { mlsApi } from './apis/mls';
import { notificationsApi } from './apis/notifications';
import { pttApi } from './apis/ptt';
import { serverApi } from './apis/server';
import { settingsApi } from './apis/settings';
import { unfurlApi } from './apis/unfurl';
import { updaterApi } from './apis/updater';
import { windowApi } from './apis/window';

const api = {
    server: serverApi,
    auth: authApi,
    ptt: pttApi,
    notifications: notificationsApi,
    settings: settingsApi,
    window: windowApi,
    updater: updaterApi,
    mls: mlsApi,
    messages: messagesApi,
    attachments: attachmentsApi,
    clipboard: clipboardApi,
    unfurl: unfurlApi,
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
