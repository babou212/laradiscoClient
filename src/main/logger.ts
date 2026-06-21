import { app } from 'electron';
import log from 'electron-log/main';

export function initLogger(): void {
    log.initialize();

    log.transports.file.fileName = 'laradisco.log';
    log.transports.file.maxSize = 5 * 1024 * 1024; // 5MB, then rolls over to laradisco.old.log
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] [{processType}] {text}';
    log.transports.file.level = 'info';
    log.transports.console.level = app.isPackaged ? 'info' : 'debug';

    log.errorHandler.startCatching({ showDialog: false });

    log.info('app starting', { version: app.getVersion(), platform: process.platform });
}

export function getLogFilePath(): string {
    return log.transports.file.getFile().path;
}

export const logger = log;
