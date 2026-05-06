import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { app, safeStorage } from 'electron';

export interface PersistedAuthSession {
    user_id: number;
    user_name: string;
    user_email: string;
    user_avatar: string | null;
    token: string;
    saved_at: string;
}

function authFilePath(): string {
    return join(app.getPath('userData'), 'auth.bin');
}

function requireSafeStorage(): void {
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
            'OS keychain encryption is not available. LaraDisco requires a working keychain (GNOME Keyring, macOS Keychain, or Windows DPAPI) to protect sensitive data.',
        );
    }
}

export function saveAuthSession(payload: Omit<PersistedAuthSession, 'saved_at'>): void {
    requireSafeStorage();
    const session: PersistedAuthSession = { ...payload, saved_at: new Date().toISOString() };
    const encrypted = safeStorage.encryptString(JSON.stringify(session));
    writeFileSync(authFilePath(), encrypted, { mode: 0o600 });
}

export function getAuthSession(): PersistedAuthSession | null {
    const path = authFilePath();
    if (!existsSync(path)) return null;
    requireSafeStorage();

    try {
        const encrypted = readFileSync(path);
        const json = safeStorage.decryptString(encrypted);
        return JSON.parse(json) as PersistedAuthSession;
    } catch {
        try {
            unlinkSync(path);
        } catch {
            // Ignore unlink errors — file may already be gone
        }
        return null;
    }
}

export function removeAuthSession(): void {
    const path = authFilePath();
    if (!existsSync(path)) return;
    try {
        unlinkSync(path);
    } catch {
        // Ignore unlink errors
    }
}
