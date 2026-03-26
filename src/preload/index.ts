import { electronAPI } from '@electron-toolkit/preload';
import { contextBridge } from 'electron';

import { authApi } from './apis/auth';
import { messagesApi } from './apis/messages';
import { mlsApi } from './apis/mls';
import { notificationsApi } from './apis/notifications';
import { pttApi } from './apis/ptt';
import { screenApi } from './apis/screen';
import { serverApi } from './apis/server';
import { settingsApi } from './apis/settings';
import { updaterApi } from './apis/updater';
import { windowApi } from './apis/window';

const api = {
    server: serverApi,
    auth: authApi,
    ptt: pttApi,
    notifications: notificationsApi,
    screen: screenApi,
    settings: settingsApi,
    window: windowApi,
    updater: updaterApi,
    mls: mlsApi,
    messages: messagesApi,
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
