import { spawn } from 'child_process';
import { closeSync, constants, existsSync, openSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';


const INPUT_DIR = '/dev/input';

export const RULE_PATH = '/etc/udev/rules.d/70-laradisco-ptt.rules';
const RULE_CONTENT = 'KERNEL=="event*", SUBSYSTEM=="input", TAG+="uaccess"';

export function hasInputAccess(): boolean {
    let files: string[];
    try {
        files = readdirSync(INPUT_DIR).filter((f) => f.startsWith('event'));
    } catch {
        return false;
    }
    for (const f of files) {
        try {
            const fd = openSync(join(INPUT_DIR, f), constants.O_RDONLY | constants.O_NONBLOCK);
            closeSync(fd);
            return true;
        } catch {
            // EACCES on this device — try the next one.
        }
    }
    return false;
}

export function isAccessRuleInstalled(): boolean {
    try {
        return existsSync(RULE_PATH) && readFileSync(RULE_PATH, 'utf8').includes('TAG+="uaccess"');
    } catch {
        return false;
    }
}

export type InstallStatus = 'installed' | 'cancelled' | 'error';
export interface InstallResult {
    status: InstallStatus;
    message?: string;
}

export function installInputAccess(): Promise<InstallResult> {
    return new Promise((resolve) => {
        const script =
            `printf '%s\\n' '${RULE_CONTENT}' > '${RULE_PATH}' && ` +
            `chmod 0644 '${RULE_PATH}' && ` +
            `udevadm control --reload-rules && ` +
            `udevadm trigger --subsystem-match=input && ` +
            `udevadm settle --timeout=5`;

        let proc;
        try {
            proc = spawn('pkexec', ['sh', '-c', script], { stdio: ['ignore', 'ignore', 'pipe'] });
        } catch (err) {
            resolve({ status: 'error', message: err instanceof Error ? err.message : String(err) });
            return;
        }

        let stderr = '';
        proc.stderr?.on('data', (d) => (stderr += d.toString()));
        proc.on('error', (err) => resolve({ status: 'error', message: err.message }));
        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ status: 'installed' });
            } else if (code === 126 || code === 127) {
                resolve({ status: 'cancelled' });
            } else {
                resolve({ status: 'error', message: stderr.trim() || `pkexec exited with code ${code}` });
            }
        });
    });
}
