import api from './client';

export async function getTwoFactorStatus(): Promise<{ twoFactorEnabled: boolean }> {
    const r = await api.get('/settings/two-factor');
    return r.data;
}

export function enableTwoFactor(): Promise<void> {
    return api.post('/settings/two-factor/enable');
}

export function disableTwoFactor(): Promise<void> {
    return api.delete('/settings/two-factor/disable');
}

export function confirmTwoFactor(code: string): Promise<void> {
    return api.post('/settings/two-factor/confirm', { code });
}

export async function regenerateRecoveryCodes(): Promise<string[]> {
    const r = await api.post('/settings/two-factor/recovery-codes');
    return r.data.recovery_codes ?? r.data ?? [];
}

export async function getTwoFactorQrCode(): Promise<{ svg: string }> {
    const r = await api.get('/settings/two-factor/qr-code');
    return r.data;
}

export async function getTwoFactorSecretKey(): Promise<{ secretKey: string }> {
    const r = await api.get('/settings/two-factor/secret-key');
    return r.data;
}

export async function getTwoFactorRecoveryCodes(): Promise<string[]> {
    const r = await api.get('/settings/two-factor/recovery-codes');
    return r.data.recovery_codes ?? r.data ?? [];
}
