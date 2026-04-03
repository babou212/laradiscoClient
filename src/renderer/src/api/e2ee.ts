import api from './client';

export interface Argon2Params {
    memory: number;
    iterations: number;
    parallelism: number;
}

export function registerIdentity(identityKey: string): Promise<void> {
    return api.post('/e2ee/identity/register', { identity_key: identityKey });
}

export async function getIdentity(userId: string | number | undefined): Promise<{ identity_key?: string }> {
    const r = await api.get(`/e2ee/identity/${userId}`);
    return r.data?.data ?? r.data;
}

export function resetIdentity(): Promise<void> {
    return api.delete('/e2ee/identity/reset');
}

export function registerDevice(deviceId: string, deviceName: string): Promise<void> {
    return api.post('/e2ee/devices/register', {
        device_id: deviceId,
        device_name: deviceName,
    });
}

export function uploadKeyPackages(deviceId: string, keyPackages: unknown[]): Promise<void> {
    return api.post('/e2ee/mls/key-packages', {
        device_id: deviceId,
        key_packages: keyPackages,
    });
}

export async function getGroupStatus(
    groupId: string,
): Promise<{ exists: boolean; is_own_group: boolean; has_welcome: boolean }> {
    const r = await api.get(`/e2ee/mls/groups/${encodeURIComponent(groupId)}/status`);
    return r.data?.data ?? r.data;
}

export async function getWelcomeMessages(): Promise<
    Array<{ group_id: string; welcome_bytes: string; ratchet_tree_bytes: string }>
> {
    const r = await api.get('/e2ee/mls/welcome');
    return r.data?.data ?? [];
}

export async function getAuditLog(
    userId: string | number,
): Promise<unknown[]> {
    const r = await api.get(`/e2ee/audit-log/${userId}`);
    return r.data?.data ?? r.data ?? [];
}

export function claimGroup(
    groupId: string,
    deviceId: string | null,
    force?: boolean,
): Promise<void> {
    return api.post(`/e2ee/mls/groups/${encodeURIComponent(groupId)}/claim`, {
        device_id: deviceId,
        ...(force ? { force: true } : {}),
    });
}

export function submitJoinRequest(
    groupId: string,
    deviceId: string | null,
): Promise<void> {
    return api.post(`/e2ee/mls/groups/${encodeURIComponent(groupId)}/join-request`, {
        device_id: deviceId,
    });
}

export function fulfillJoinRequest(
    groupId: string,
    deviceId: string,
): Promise<void> {
    return api.post(`/e2ee/mls/groups/${encodeURIComponent(groupId)}/join-request/fulfill`, {
        device_id: deviceId,
    });
}

export async function getMemberBundles(
    targetId: string | number,
    type: 'channel' | 'dm',
): Promise<Array<{ user_id: number; devices: Array<{ device_id: string }> }>> {
    const endpoint =
        type === 'dm'
            ? `/e2ee/dm-groups/${targetId}/members/bundles`
            : `/e2ee/channels/${targetId}/members/bundles`;
    const r = await api.get(endpoint);
    return r.data?.data ?? [];
}

export async function getKeyPackages(
    userId: string | number,
    deviceId: string,
): Promise<Array<{ device_id: string; key_package_bytes: string; key_package_hash: string }>> {
    const r = await api.get(`/e2ee/mls/key-packages/${userId}`, {
        params: { device_id: deviceId },
    });
    return r.data?.data ?? [];
}

export function postGroupMessage(
    groupId: string,
    data: {
        device_id: string | null;
        message_type: string;
        message_bytes: string;
        epoch: number;
    },
): Promise<void> {
    return api.post(`/e2ee/mls/groups/${encodeURIComponent(groupId)}/messages`, data);
}

export function sendWelcome(
    groupId: string,
    data: {
        recipient_user_id: string | number;
        recipient_device_id: string;
        welcome_bytes: string;
        ratchet_tree_bytes: string;
    },
): Promise<void> {
    return api.post(`/e2ee/mls/groups/${encodeURIComponent(groupId)}/welcome`, data);
}

export async function getGroupMessages(
    groupId: string,
    params: { since_epoch: number; message_type: string },
): Promise<Array<{ message_bytes: string; sender_device_id: string; epoch: number }>> {
    const r = await api.get(`/e2ee/mls/groups/${encodeURIComponent(groupId)}/messages`, {
        params,
    });
    return r.data?.data ?? [];
}

export async function getGroupHistory(
    groupId: string,
    params: Record<string, string | number>,
): Promise<Array<{ id: number; history_ciphertext: string }>> {
    const r = await api.get(`/e2ee/mls/groups/${encodeURIComponent(groupId)}/history`, {
        params,
    });
    return r.data?.data ?? [];
}

export async function getUserGroups(): Promise<string[]> {
    const r = await api.get('/e2ee/mls/user-groups');
    return r.data?.data ?? [];
}

export async function backupExists(): Promise<boolean> {
    const r = await api.get('/e2ee/keys/backup/exists');
    return r.data?.data?.exists ?? r.data?.exists ?? false;
}

interface BackupPayload {
    encrypted_bundle: string;
    salt: string;
    nonce: string;
    argon2_params: Argon2Params;
}

export function createBackup(payload: BackupPayload): Promise<void> {
    return api.post('/e2ee/keys/backup', payload);
}

export function updateBackup(payload: BackupPayload): Promise<void> {
    return api.put('/e2ee/keys/backup', payload);
}

export async function getBackup(): Promise<{
    encrypted_bundle: string;
    salt: string;
    nonce: string;
    argon2_params: Argon2Params;
} | null> {
    const r = await api.get('/e2ee/keys/backup');
    return r.data?.data ?? r.data ?? null;
}

export function confirmBackup(): Promise<void> {
    return api.post('/e2ee/keys/backup/confirm');
}

export function unlockBackup(twoFactorCode: string): Promise<void> {
    return api.post('/e2ee/keys/backup/unlock', { two_factor_code: twoFactorCode });
}

export function deleteBackup(): Promise<void> {
    return api.delete('/e2ee/keys/backup');
}

export async function fetchDevices(): Promise<Array<{ id: number; device_id: string; device_name: string; created_at: string; last_active_at: string | null }>> {
    const r = await api.get('/e2ee/devices');
    return r.data?.data ?? r.data ?? [];
}

export function revokeDevice(deviceId: string): Promise<void> {
    return api.delete(`/e2ee/devices/${deviceId}`);
}

export function renameDevice(deviceId: string, name: string): Promise<void> {
    return api.put(`/e2ee/devices/${deviceId}/name`, { device_name: name });
}

export async function getKeyPackageCount(): Promise<number> {
    const r = await api.get('/e2ee/mls/key-packages/count');
    return r.data?.count ?? 0;
}
