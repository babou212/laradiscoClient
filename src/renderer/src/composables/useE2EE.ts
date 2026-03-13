import { useServerStore } from '@/stores/server';
import { useAuthStore } from '@/stores/auth';
import api from '@/lib/api';
import type { MessageData } from '@/types/chat';

/**
 * Vue composable wrapping the E2EE IPC bridge (`window.api.e2ee.*`)
 * and the server-side E2EE API endpoints.
 *
 * All cryptographic operations happen in the Electron main process;
 * this composable merely orchestrates IPC calls and HTTP requests.
 */
export function useE2EE() {
    function getServerId(): number {
        const serverStore = useServerStore();
        const id = serverStore.activeServer?.id;
        if (!id) throw new Error('No active server');
        return id;
    }

    function getUserId(): number | undefined {
        const authStore = useAuthStore();
        return authStore.user?.id;
    }

    /** Check whether E2EE keys exist locally for the active server and current user. */
    async function isSetup(): Promise<boolean> {
        return window.api.e2ee.isSetup(getServerId(), getUserId());
    }

    /** Get this device's UUID (null if not set up or belongs to different user). */
    async function getDeviceId(): Promise<string | null> {
        return window.api.e2ee.getDeviceId(getServerId(), getUserId());
    }

    /**
     * First-time E2EE setup: generates User Identity Key + Device keys,
     * registers them with the server. Returns the setup result.
     */
    async function setup(deviceName: string) {
        const serverId = getServerId();
        const userId = getUserId();
        const result = await window.api.e2ee.setup(serverId, deviceName, userId);

        // Register identity key on server (handle 409 if already registered)
        try {
            await api.post('/e2ee/identity/register', {
                identity_key: result.userIdentityKey,
            });
        } catch (err: any) {
            if (err.response?.status === 409) {
                // Identity already exists on the server. Check whether the
                // existing key matches before deciding to reset.
                try {
                    const existing = await api.get(`/e2ee/identity/${userId}`);
                    if (existing.data?.identity_key === result.userIdentityKey) {
                        // Same key — no reset needed, just proceed to device registration
                    } else {
                        // Different key — must reset (new identity generated locally)
                        await api.delete('/e2ee/identity/reset');
                        await api.post('/e2ee/identity/register', {
                            identity_key: result.userIdentityKey,
                        });
                    }
                } catch {
                    // Couldn't verify — fall back to reset for safety
                    await api.delete('/e2ee/identity/reset');
                    await api.post('/e2ee/identity/register', {
                        identity_key: result.userIdentityKey,
                    });
                }
            } else {
                throw err;
            }
        }

        // Register device on server
        await api.post('/e2ee/devices/register', {
            device_id: result.deviceId,
            device_name: result.deviceName,
            device_identity_key: result.deviceIdentityKey,
            identity_signature: result.identitySignature,
            signed_prekey: result.signedPrekey,
            signed_prekey_id: result.signedPrekeyId,
            signed_prekey_signature: result.signedPrekeySignature,
            one_time_prekeys: result.oneTimePrekeys.map((k) => ({
                prekey_id: k.prekeyId,
                public_key: k.publicKey,
            })),
        });

        return result;
    }

    /**
     * Multi-device setup: reuses restored User Identity Key, generates
     * new device keys, registers them with the server.
     */
    async function setupDevice(deviceName: string) {
        const serverId = getServerId();
        const userId = getUserId();
        const result = await window.api.e2ee.setupDevice(serverId, deviceName, userId);

        // Verify local identity key matches server before registering device
        // to prevent registering a device signed with a stale/mismatched key.
        try {
            const identityResponse = await api.get(`/e2ee/identity/${userId}`);
            const serverIdentityKey = identityResponse.data?.identity_key;
            if (serverIdentityKey && serverIdentityKey !== result.userIdentityKey) {
                throw new Error(
                    'Local identity key does not match server. Please re-setup E2EE (your identity key may have changed on another device).',
                );
            }
        } catch (err: any) {
            // 404 means no identity registered yet — fine, setup() should be used instead
            if (err.response?.status === 404) {
                throw new Error('No identity key registered on server. Use full setup instead of setupDevice.');
            }
            // Re-throw our own mismatch error
            if (err.message?.includes('does not match')) throw err;
            // Network errors — proceed cautiously
        }

        // Register device on server
        await api.post('/e2ee/devices/register', {
            device_id: result.deviceId,
            device_name: result.deviceName,
            device_identity_key: result.deviceIdentityKey,
            identity_signature: result.identitySignature,
            signed_prekey: result.signedPrekey,
            signed_prekey_id: result.signedPrekeyId,
            signed_prekey_signature: result.signedPrekeySignature,
            one_time_prekeys: result.oneTimePrekeys.map((k) => ({
                prekey_id: k.prekeyId,
                public_key: k.publicKey,
            })),
        });

        return result;
    }

    /**
     * Track which device IDs we've already distributed our sender key to,
     * per channel. This allows incremental distribution to new members
     * without re-encrypting for devices that already have the key.
     */
    const distributedDevicesPerChannel = new Map<number, Set<string>>();

    /** Timestamp of the last member bundle check per channel */
    const lastMemberCheckPerChannel = new Map<number, number>();

    /** How often (ms) to re-check for new channel members. */
    const MEMBER_CHECK_INTERVAL = 10_000; // 10 seconds

    /**
     * Encrypt a channel message using Sender Keys.
     * Returns the encrypted payload string to send as message content.
     * Ensures sender key is created and distributed to ALL current channel
     * members — including any who joined since the last distribution.
     */
    async function encryptForChannel(channelId: number, plaintext: string): Promise<string> {
        const serverId = getServerId();

        // Ensure sender key is distributed to all current members (incremental)
        try {
            await ensureSenderKeyDistributed(channelId);
        } catch (err) {
            // Sender key distribution failed (may already exist)
        }

        return window.api.e2ee.encrypt({
            serverId,
            type: 'channel',
            targetId: channelId,
            plaintext,
        });
    }

    /**
     * Ensure our sender key is distributed to all current channel members.
     * On first call, creates the sender key and distributes to everyone.
     * On subsequent calls, only distributes to devices added since the last call
     * (e.g. new members who joined the channel or set up E2EE after initial distribution).
     *
     * @param force — skip the rate-limit check and re-check members immediately
     *                (used when responding to a SenderKeyNeeded event).
     */
    async function ensureSenderKeyDistributed(channelId: number, force = false) {
        const now = Date.now();
        const lastCheck = lastMemberCheckPerChannel.get(channelId) ?? 0;
        const hasDistributed = distributedDevicesPerChannel.has(channelId);

        // After initial distribution, only re-check for new members periodically
        if (!force && hasDistributed && (now - lastCheck < MEMBER_CHECK_INTERVAL)) {
            return;
        }

        // When force=true (e.g. responding to SenderKeyNeeded), clear the
        // tracking so we re-distribute to ALL devices — not just new ones.
        // A device may have missed or failed to decrypt a previous distribution.
        if (force) {
            distributedDevicesPerChannel.delete(channelId);
        }

        const serverId = getServerId();
        const distribution = await window.api.e2ee.createSenderKey(serverId, channelId);
        const ourDeviceId = (await getDeviceId()) ?? '';

        // Fetch all current channel members' key bundles
        const membersResponse = await api.get(`/e2ee/channels/${channelId}/members/bundles`);
        const memberBundles: Array<{
            user_id: number;
            devices: Array<{ device_id: string; device_identity_key: string }>;
        }> = membersResponse.data ?? [];

        // Determine which devices we haven't distributed to yet
        const alreadyDistributed = distributedDevicesPerChannel.get(channelId) ?? new Set<string>();
        const newDistributions: Array<{
            recipient_user_id: number;
            recipient_device_id: string;
            encrypted_distribution: string;
            ephemeral_public_key: string;
            nonce: string;
        }> = [];

        for (const member of memberBundles) {
            for (const device of member.devices) {
                if (device.device_id === ourDeviceId) continue;
                if (alreadyDistributed.has(device.device_id)) continue;

                const encrypted = await window.api.e2ee.encryptSenderKeyDist({
                    distribution,
                    recipientDeviceIdentityKey: device.device_identity_key,
                });

                newDistributions.push({
                    recipient_user_id: member.user_id,
                    recipient_device_id: device.device_id,
                    encrypted_distribution: encrypted.encryptedDistribution,
                    ephemeral_public_key: encrypted.ephemeralPublicKey,
                    nonce: encrypted.nonce,
                });
            }
        }

        if (newDistributions.length > 0) {
            await api.post(`/e2ee/channels/${channelId}/sender-keys`, {
                device_id: ourDeviceId,
                distribution_id: distribution.distributionId,
                distributions: newDistributions,
            });
        }

        // Update tracking with all current member devices
        const updatedSet = new Set(alreadyDistributed);
        for (const d of newDistributions) {
            updatedSet.add(d.recipient_device_id);
        }
        distributedDevicesPerChannel.set(channelId, updatedSet);
        lastMemberCheckPerChannel.set(channelId, Date.now());
    }

    /**
     * Per-DM-group tracking, mirroring the channel equivalents above.
     */
    const distributedDevicesPerDmGroup = new Map<number, Set<string>>();
    const lastMemberCheckPerDmGroup = new Map<number, number>();

    /**
     * Encrypt a DM using Sender Keys (same protocol as channels).
     * Ensures our sender key is distributed to all DM group participants.
     */
    async function encryptForDM(dmGroupId: number, plaintext: string): Promise<string> {
        const serverId = getServerId();

        // Ensure sender key is distributed to all DM group participants (incremental)
        try {
            await ensureDmSenderKeyDistributed(dmGroupId);
        } catch (err) {
            // DM sender key distribution failed (may already exist)
        }

        return window.api.e2ee.encrypt({
            serverId,
            type: 'dm',
            targetId: dmGroupId,
            plaintext,
        });
    }

    /**
     * Ensure our sender key is distributed to all DM group participants.
     * Same incremental pattern as `ensureSenderKeyDistributed` but hits DM API routes.
     */
    async function ensureDmSenderKeyDistributed(dmGroupId: number, force = false) {
        const now = Date.now();
        const lastCheck = lastMemberCheckPerDmGroup.get(dmGroupId) ?? 0;
        const hasDistributed = distributedDevicesPerDmGroup.has(dmGroupId);

        if (!force && hasDistributed && (now - lastCheck < MEMBER_CHECK_INTERVAL)) {
            return;
        }

        if (force) {
            distributedDevicesPerDmGroup.delete(dmGroupId);
        }

        const serverId = getServerId();
        // Use negated DM group ID for local sender key storage to avoid collision with channel IDs
        const distribution = await window.api.e2ee.createSenderKey(serverId, -dmGroupId);
        const ourDeviceId = (await getDeviceId()) ?? '';

        // Fetch all DM group participants' key bundles
        const membersResponse = await api.get(`/e2ee/dm-groups/${dmGroupId}/members/bundles`);
        const memberBundles: Array<{
            user_id: number;
            devices: Array<{ device_id: string; device_identity_key: string }>;
        }> = membersResponse.data ?? [];

        const alreadyDistributed = distributedDevicesPerDmGroup.get(dmGroupId) ?? new Set<string>();
        const newDistributions: Array<{
            recipient_user_id: number;
            recipient_device_id: string;
            encrypted_distribution: string;
            ephemeral_public_key: string;
            nonce: string;
        }> = [];

        for (const member of memberBundles) {
            for (const device of member.devices) {
                if (device.device_id === ourDeviceId) continue;
                if (alreadyDistributed.has(device.device_id)) continue;

                const encrypted = await window.api.e2ee.encryptSenderKeyDist({
                    distribution,
                    recipientDeviceIdentityKey: device.device_identity_key,
                });

                newDistributions.push({
                    recipient_user_id: member.user_id,
                    recipient_device_id: device.device_id,
                    encrypted_distribution: encrypted.encryptedDistribution,
                    ephemeral_public_key: encrypted.ephemeralPublicKey,
                    nonce: encrypted.nonce,
                });
            }
        }

        if (newDistributions.length > 0) {
            await api.post(`/e2ee/dm-groups/${dmGroupId}/sender-keys`, {
                device_id: ourDeviceId,
                distribution_id: distribution.distributionId,
                distributions: newDistributions,
            });
        }

        const updatedSet = new Set(alreadyDistributed);
        for (const d of newDistributions) {
            updatedSet.add(d.recipient_device_id);
        }
        distributedDevicesPerDmGroup.set(dmGroupId, updatedSet);
        lastMemberCheckPerDmGroup.set(dmGroupId, Date.now());
    }

    /**
     * Decrypt a received message (channel or DM).
     * Parses the encrypted payload and delegates to main process.
     * Pass either `channelId` (for channel messages) or `dmGroupId` (for DM messages).
     */
    async function decrypt(encryptedContent: string, senderId: number, senderDeviceId: string, channelId?: number, dmGroupId?: number): Promise<string> {
        const serverId = getServerId();
        return window.api.e2ee.decrypt({
            serverId,
            payload: encryptedContent,
            senderId,
            senderDeviceId,
            channelId,
            dmGroupId,
        });
    }

    async function decryptMessage(message: MessageData, channelId?: number, dmGroupId?: number): Promise<void> {
        if (!message.is_encrypted) return;
        if (message.decrypted_content !== undefined) return;
        if (message.decrypt_error) return;

        const MAX_DECRYPT_ATTEMPTS = 5;
        message.decrypt_attempts = (message.decrypt_attempts ?? 0) + 1;

        let senderDeviceId = message.sender_device_id ?? '';
        if (!senderDeviceId) {
            try {
                const parsed = JSON.parse(message.content);
                senderDeviceId = parsed.sender_device_id ?? '';
            } catch {
                // content might not be valid JSON, proceed with empty device id
            }
        }

        try {
            const plaintext = await decrypt(message.content, message.user.id, senderDeviceId, channelId, dmGroupId);
            message.decrypted_content = plaintext;
            message.decrypt_error = false;
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            const isMissingSenderKey = errMsg.includes('Need sender key distribution');

            if (isMissingSenderKey) {
                if (message.decrypt_attempts >= MAX_DECRYPT_ATTEMPTS) {
                    console.warn(`Decryption failed after ${MAX_DECRYPT_ATTEMPTS} attempts for message ${message.id} — marking as permanently failed`);
                    message.decrypted_content = undefined;
                    message.decrypt_error = true;
                    return;
                }

                try {
                    if (dmGroupId != null) {
                        await fetchAndProcessDmSenderKeys(dmGroupId);
                    } else if (channelId != null) {
                        await fetchAndProcessSenderKeys(channelId);
                    }
                    const plaintext = await decrypt(message.content, message.user.id, senderDeviceId, channelId, dmGroupId);
                    message.decrypted_content = plaintext;
                    message.decrypt_error = false;
                    return;
                } catch {
                    if (message.decrypt_attempts < MAX_DECRYPT_ATTEMPTS) {
                        if (dmGroupId != null) {
                            requestDmSenderKeys(dmGroupId).catch(() => {});
                        } else if (channelId != null) {
                            requestSenderKeys(channelId).catch(() => {});
                        }
                    }
                    return;
                }
            }

            message.decrypted_content = undefined;
            message.decrypt_error = true;
        }
    }

    const decryptionQueues = new Map<string, Promise<void>>();

    function enqueueDecryption(channelId: number | undefined, dmGroupId: number | undefined, task: () => Promise<void>): Promise<void> {
        const key = dmGroupId ? `decrypt-dm-${dmGroupId}` : `decrypt-${channelId ?? 'unknown'}`;
        const prev = decryptionQueues.get(key) ?? Promise.resolve();
        const next = prev.then(task, task);
        decryptionQueues.set(key, next);
        next.finally(() => {
            if (decryptionQueues.get(key) === next) {
                decryptionQueues.delete(key);
            }
        });
        return next;
    }

    async function decryptMessages(messages: MessageData[], channelId?: number, dmGroupId?: number): Promise<void> {
        return enqueueDecryption(channelId, dmGroupId, async () => {
            const encrypted = messages.filter((m) => m.is_encrypted && m.decrypted_content === undefined && !m.decrypt_error);
            if (encrypted.length === 0) return;

            for (const m of encrypted) {
                await decryptMessage(m, channelId, dmGroupId);
            }
        });
    }

    async function decryptMessageQueued(message: MessageData, channelId?: number, dmGroupId?: number): Promise<void> {
        return enqueueDecryption(channelId, dmGroupId, async () => {
            await decryptMessage(message, channelId, dmGroupId);
        });
    }

    async function retryPendingDecryptions(messages: MessageData[], channelId?: number, dmGroupId?: number, fetchFirst = false): Promise<void> {
        const pending = messages.filter(
            (m) => m.is_encrypted && m.decrypted_content === undefined && !m.decrypt_error,
        );
        if (pending.length === 0) return;

        if (fetchFirst) {
            try {
                if (dmGroupId != null) {
                    await fetchAndProcessDmSenderKeys(dmGroupId);
                } else if (channelId != null) {
                    await fetchAndProcessSenderKeys(channelId);
                }
            } catch {
                // Fetch failed — still attempt decryption with locally cached keys
            }
        }

        for (const m of pending) {
            await decryptMessage(m, channelId, dmGroupId);
        }
    }

    async function requestSenderKeys(channelId: number): Promise<void> {
        const deviceId = (await getDeviceId()) ?? '';
        if (!deviceId) return;
        try {
            await api.post(`/e2ee/channels/${channelId}/request-sender-keys`, {
                device_id: deviceId,
            });
        } catch (err) {
            // Failed to request sender keys
        }
    }

    async function requestDmSenderKeys(dmGroupId: number): Promise<void> {
        const deviceId = (await getDeviceId()) ?? '';
        if (!deviceId) return;
        try {
            await api.post(`/e2ee/dm-groups/${dmGroupId}/request-sender-keys`, {
                device_id: deviceId,
            });
        } catch (err) {
            // Failed to request DM sender keys
        }
    }

    async function createAndDistributeSenderKey(channelId: number) {
        const serverId = getServerId();
        const distribution = await window.api.e2ee.createSenderKey(serverId, channelId);
        const ourDeviceId = (await getDeviceId()) ?? '';

        const membersResponse = await api.get(`/e2ee/channels/${channelId}/members/bundles`);
        const memberBundles: Array<{
            user_id: number;
            devices: Array<{ device_id: string; device_identity_key: string }>;
        }> = membersResponse.data ?? [];

        const distributions: Array<{
            recipient_user_id: number;
            recipient_device_id: string;
            encrypted_distribution: string;
            ephemeral_public_key: string;
            nonce: string;
        }> = [];

        for (const member of memberBundles) {
            for (const device of member.devices) {
                if (device.device_id === ourDeviceId) continue; // skip self

                const encrypted = await window.api.e2ee.encryptSenderKeyDist({
                    distribution,
                    recipientDeviceIdentityKey: device.device_identity_key,
                });

                distributions.push({
                    recipient_user_id: member.user_id,
                    recipient_device_id: device.device_id,
                    encrypted_distribution: encrypted.encryptedDistribution,
                    ephemeral_public_key: encrypted.ephemeralPublicKey,
                    nonce: encrypted.nonce,
                });
            }
        }

        await api.post(`/e2ee/channels/${channelId}/sender-keys`, {
            device_id: ourDeviceId,
            distribution_id: distribution.distributionId,
            distributions,
        });

        return distribution;
    }

    async function fetchAndProcessSenderKeys(channelId: number) {
        const serverId = getServerId();
        const deviceId = (await getDeviceId()) ?? '';
        const response = await api.get(`/e2ee/channels/${channelId}/sender-keys`, {
            params: { device_id: deviceId },
        });
        const encryptedDists: Array<{
            sender_user_id: number;
            sender_device_id: string;
            distribution_id: string;
            encrypted_distribution: string;
            ephemeral_public_key: string;
            nonce: string;
        }> = response.data ?? [];

        for (const sk of encryptedDists) {
            const distribution = await window.api.e2ee.decryptSenderKeyDist({
                serverId,
                encryptedDistribution: sk.encrypted_distribution,
                ephemeralPublicKey: sk.ephemeral_public_key,
                nonce: sk.nonce,
            });

            await window.api.e2ee.processSenderKeyDist({
                serverId,
                channelId,
                senderId: String(sk.sender_user_id),
                senderDeviceId: sk.sender_device_id,
                distribution,
            });
        }
    }

    async function fetchAndProcessDmSenderKeys(dmGroupId: number) {
        const serverId = getServerId();
        const deviceId = (await getDeviceId()) ?? '';
        const response = await api.get(`/e2ee/dm-groups/${dmGroupId}/sender-keys`, {
            params: { device_id: deviceId },
        });
        const encryptedDists: Array<{
            sender_user_id: number;
            sender_device_id: string;
            distribution_id: string;
            encrypted_distribution: string;
            ephemeral_public_key: string;
            nonce: string;
        }> = response.data ?? [];

        for (const sk of encryptedDists) {
            const distribution = await window.api.e2ee.decryptSenderKeyDist({
                serverId,
                encryptedDistribution: sk.encrypted_distribution,
                ephemeralPublicKey: sk.ephemeral_public_key,
                nonce: sk.nonce,
            });

            await window.api.e2ee.processSenderKeyDist({
                serverId,
                channelId: -dmGroupId,
                senderId: String(sk.sender_user_id),
                senderDeviceId: sk.sender_device_id,
                distribution,
            });
        }
    }

    async function rotateSenderKey(channelId: number) {
        const serverId = getServerId();

        await window.api.e2ee.invalidateChannelSenderKeys(serverId, channelId);

        try {
            await api.delete(`/e2ee/channels/${channelId}/sender-keys`);
        } catch (err) {
            // Failed to invalidate server sender keys
        }

        distributedDevicesPerChannel.delete(channelId);
        lastMemberCheckPerChannel.delete(channelId);

        await ensureSenderKeyDistributed(channelId);

        await fetchAndProcessSenderKeys(channelId);
    }

    async function rotateDmSenderKey(dmGroupId: number) {
        const serverId = getServerId();

        await window.api.e2ee.invalidateChannelSenderKeys(serverId, -dmGroupId);

        try {
            await api.delete(`/e2ee/dm-groups/${dmGroupId}/sender-keys`);
        } catch (err) {
            // Failed to invalidate server DM sender keys
        }

        distributedDevicesPerDmGroup.delete(dmGroupId);
        lastMemberCheckPerDmGroup.delete(dmGroupId);

        await ensureDmSenderKeyDistributed(dmGroupId);
        await fetchAndProcessDmSenderKeys(dmGroupId);
    }

    async function backupExists(): Promise<boolean> {
        const response = await api.get('/e2ee/keys/backup/exists');
        return response.data?.exists ?? false;
    }

    async function backupKeys(pin: string) {
        const serverId = getServerId();
        const backup = await window.api.e2ee.backupKeys(serverId, pin);

        await api.post('/e2ee/keys/backup', {
            encrypted_bundle: backup.encryptedBundle,
            salt: backup.salt,
            nonce: backup.nonce,
            argon2_params: backup.argon2Params,
        });

        return backup;
    }

    async function restoreKeys(pin: string): Promise<{ success: boolean; error?: string }> {
        const serverId = getServerId();

        const response = await api.get('/e2ee/keys/backup');
        const data = response.data;

        if (!data) {
            return { success: false, error: 'No backup found' };
        }

        return window.api.e2ee.restoreKeys(serverId, {
            encryptedBundle: data.encrypted_bundle,
            salt: data.salt,
            nonce: data.nonce,
            argon2Params: data.argon2_params,
        }, pin);
    }

    async function deleteBackup() {
        await api.delete('/e2ee/keys/backup');
    }

    async function fetchDevices() {
        const response = await api.get('/e2ee/devices');
        return response.data ?? [];
    }

    async function revokeDevice(deviceId: string) {
        await api.delete(`/e2ee/devices/${deviceId}`);
    }

    async function renameDevice(deviceId: string, name: string) {
        await api.put(`/e2ee/devices/${deviceId}/name`, { device_name: name });
    }

    async function checkAndReplenishPrekeys(threshold = 25, replenishCount = 75) {
        const serverId = getServerId();
        const deviceId = await getDeviceId();
        if (!deviceId) return { replenished: false, currentCount: 0 };

        let count: number;
        try {
            const response = await api.get('/e2ee/keys/prekeys/count', {
                params: { device_id: deviceId },
            });
            count = response.data?.remaining_prekeys ?? response.data?.count ?? 0;
        } catch (err: any) {
            if (err.response?.status === 404) {
                return { replenished: false, currentCount: 0 };
            }
            throw err;
        }

        if (count < threshold) {
            const newPrekeys = await window.api.e2ee.generatePreKeys(serverId, replenishCount);
            await api.post('/e2ee/keys/prekeys/replenish', {
                device_id: deviceId,
                prekeys: newPrekeys.map((k) => ({
                    prekey_id: k.prekeyId,
                    public_key: k.publicKey,
                })),
            });
            return { replenished: true, newCount: count + replenishCount };
        }

        return { replenished: false, currentCount: count };
    }

    async function rotateSignedPrekeyIfNeeded(maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
        const serverId = getServerId();

        const lastRotation = await window.api.settings.get(`e2ee_last_spk_rotation_${serverId}`);
        const lastRotationTime = lastRotation ? parseInt(lastRotation, 10) : 0;

        if (Date.now() - lastRotationTime < maxAgeMs) {
            return { rotated: false };
        }

        const result = await window.api.e2ee.rotateSignedPreKey(serverId);

        await api.put('/e2ee/keys/signed-prekey', {
            device_id: result.deviceId,
            signed_prekey: result.signedPrekey,
            signed_prekey_id: result.signedPrekeyId,
            signed_prekey_signature: result.signedPrekeySignature,
        });

        await window.api.settings.set(`e2ee_last_spk_rotation_${serverId}`, String(Date.now()));

        return { rotated: true };
    }

    async function wipe() {
        const serverId = getServerId();
        await window.api.e2ee.wipe(serverId);
    }

    async function wipeIfUserChanged(): Promise<boolean> {
        const serverId = getServerId();
        const userId = getUserId();
        if (!userId) return false;
        return window.api.e2ee.wipeForUserMismatch(serverId, userId);
    }

    return {
        isSetup,
        getDeviceId,
        setup,
        setupDevice,
        encryptForChannel,
        encryptForDM,
        decrypt,
        decryptMessage,
        decryptMessageQueued,
        decryptMessages,
        createAndDistributeSenderKey,
        ensureSenderKeyDistributed,
        ensureDmSenderKeyDistributed,
        fetchAndProcessSenderKeys,
        fetchAndProcessDmSenderKeys,
        requestSenderKeys,
        requestDmSenderKeys,
        retryPendingDecryptions,
        rotateSenderKey,
        rotateDmSenderKey,
        backupExists,
        backupKeys,
        restoreKeys,
        deleteBackup,
        fetchDevices,
        revokeDevice,
        renameDevice,
        checkAndReplenishPrekeys,
        rotateSignedPrekeyIfNeeded,
        wipe,
        wipeIfUserChanged,
    };
}
