import { app } from 'electron';
import log from 'electron-log/main';

// Centralised logging. Writes errors + diagnostics to a single rotating file in
// the userData dir so users can export it and send it to the developer. Both the
// main and renderer processes funnel into the same file (renderer via the
// electron-log IPC bridge set up by `log.initialize()` + the `electron-log/preload`
// import in src/preload/index.ts).
export function initLogger(): void {
    // Required in v5 so messages forwarded from the renderer over the IPC bridge
    // are received and written, and so console.* in main is intercepted.
    log.initialize();

    log.transports.file.fileName = 'laradisco.log';
    log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB, then rolls over to laradisco.old.log
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] [{processType}] {text}';
    log.transports.file.level = 'info';
    log.transports.console.level = app.isPackaged ? 'info' : 'debug';

    // Catch uncaught exceptions and unhandled promise rejections in the main
    // process. showDialog:false keeps it silent — the goal is a log file, not a
    // popup.
    log.errorHandler.startCatching({ showDialog: false });

    log.info('app starting', { version: app.getVersion(), platform: process.platform });
}

// Absolute path of the currently active log file. Always resolve via the
// transport rather than reconstructing it, so it stays correct across rotation
// and userData overrides (e.g. USER_DATA_DIR in dev).
export function getLogFilePath(): string {
    return log.transports.file.getFile().path;
}

export const logger = log;
