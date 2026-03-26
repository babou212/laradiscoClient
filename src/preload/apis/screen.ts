import { ipcRenderer } from 'electron';

export const screenApi = {
    onShowPicker: (
        callback: (
            sources: Array<{ id: string; name: string; thumbnail: string; appIcon: string | null; display_id: string }>,
        ) => void,
    ) => {
        ipcRenderer.on('screen:show-picker', (_event, sources) => callback(sources));
    },
    selectSource: (sourceId: string | null) => {
        ipcRenderer.send('screen:select-source', sourceId);
    },
    removeAllListeners: () => {
        ipcRenderer.removeAllListeners('screen:show-picker');
    },
};
