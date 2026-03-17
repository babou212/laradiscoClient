import api from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useServerStore } from '@/stores/server';
import type { MessageData } from '@/types/chat';

let autoBackupTimer: ReturnType<typeof setTimeout> | null = null;
const AUTO_BACKUP_DEBOUNCE = 5_000;

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

    function scheduleAutoBackup(): void {
        if (autoBackupTimer) clearTimeout(autoBackupTimer);
        autoBackupTimer = setTimeout(async () => {
            autoBackupTimer = null;
            try {
                await autoUpdateBackup();
            } catch (error) {
                console.error(error);
            }
        }, AUTO_BACKUP_DEBOUNCE);
    }

    async function isSetup(): Promise<boolean> {
        return window.api.e2ee.isSetup(getServerId(), getUserId());
    }

    async function getDeviceId(): Promise<string | null> {
        return window.api.e2ee.getDeviceId(getServerId(), getUserId());
    }

    async function setup(deviceName: string) {
        const serverId = getServerId();
        const userId = getUserId();
        const result = await window.api.e2ee.setup(serverId, deviceName, userId);

        try {
            await api.post('/e2ee/identity/register', {
                identity_key: result.userIdentityKey,
            });
        } catch (err: any) {
            if (err.response?.status === 409) {
                try {
                    const existing = await api.get(`/e2ee/identity/${userId}`);
                    if (existing.data?.identity_key === result.userIdentityKey) {
                    } else {
                        await api.delete('/e2ee/identity/reset');
                        await api.post('/e2ee/identity/register', {
                            identity_key: result.userIdentityKey,
                        });
                    }
                } catch {
                    await api.delete('/e2ee/identity/reset');
                    await api.post('/e2ee/identity/register', {
                        identity_key: result.userIdentityKey,
                    });
                }
            } else {
                throw err;
            }
        }

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

    async function setupDevice(deviceName: string) {
        const serverId = getServerId();
        const userId = getUserId();
        const result = await window.api.e2ee.setupDevice(serverId, deviceName, userId);

        try {
            const identityResponse = await api.get(`/e2ee/identity/${userId}`);
            const serverIdentityKey = identityResponse.data?.identity_key;
            if (serverIdentityKey && serverIdentityKey !== result.userIdentityKey) {
                throw new Error(
                    'Local identity key does not match server. Please re-setup E2EE (your identity key may have changed on another device).',
                );
            }
        } catch (err: any) {
            if (err.response?.status === 404) {
                throw new Error('No identity key registered on server. Use full setup instead of setupDevice.');
            }
            if (err.message?.includes('does not match')) throw err;
        }

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

    const distributedDevicesPerChannel = new Map<number, Set<string>>();

    const lastMemberCheckPerChannel = new Map<number, number>();


    const MEMBER_CHECK_INTERVAL = 5 * 60_000;

    const distributionFailures = new Map<number, { count: number; backoffUntil: number }>();
    const DISTRIBUTION_BACKOFF_BASE = 5_000;

    const lastSenderKeyFetchPerChannel = new Map<number, number>();
    const lastSenderKeyFetchPerDmGroup = new Map<number, number>();
    const SENDER_KEY_FETCH_INTERVAL = 60_000;
    const inFlightSenderKeyFetch = new Map<number, Promise<void>>();
    const inFlightDmSenderKeyFetch = new Map<number, Promise<void>>();

    async function encryptForChannel(channelId: number, plaintext: string): Promise<string> {
        const serverId = getServerId();

        try {
            await ensureSenderKeyDistributed(channelId);
        } catch (error) {
            console.error(error);
        }

        return window.api.e2ee.encrypt({
            serverId,
            type: 'channel',
            targetId: channelId,
            plaintext,
        });
    }

    async function ensureSenderKeyDistributed(channelId: number, force = false) {
        const now = Date.now();
        const lastCheck = lastMemberCheckPerChannel.get(channelId) ?? 0;
        const hasDistributed = distributedDevicesPerChannel.has(channelId);

        const failure = distributionFailures.get(channelId);
        if (failure && now < failure.backoffUntil) {
            return;
        }

        if (!force && hasDistributed && now - lastCheck < MEMBER_CHECK_INTERVAL) {
            return;
        }

        if (force) {
            distributedDevicesPerChannel.delete(channelId);
        }

        const serverId = getServerId();
        const distribution = await window.api.e2ee.createSenderKey(serverId, channelId);
        const ourDeviceId = (await getDeviceId()) ?? '';

        const membersResponse = await api.get(`/e2ee/channels/${channelId}/members/bundles`);
        const memberBundles: Array<{
            user_id: number;
            devices: Array<{ device_id: string; device_identity_key: string }>;
        }> = membersResponse.data ?? [];

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
            try {
                await api.post(`/e2ee/channels/${channelId}/sender-keys`, {
                    device_id: ourDeviceId,
                    distribution_id: distribution.distributionId,
                    distributions: newDistributions,
                });

                distributionFailures.delete(channelId);
            } catch (err: any) {
                const failCount = (failure?.count ?? 0) + 1;
                const backoff = DISTRIBUTION_BACKOFF_BASE * Math.pow(2, Math.min(failCount - 1, 5));
                distributionFailures.set(channelId, { count: failCount, backoffUntil: Date.now() + backoff });
                throw err;
            }
        }

        const updatedSet = new Set(alreadyDistributed);
        for (const d of newDistributions) {
            updatedSet.add(d.recipient_device_id);
        }
        distributedDevicesPerChannel.set(channelId, updatedSet);
        lastMemberCheckPerChannel.set(channelId, Date.now());

        scheduleAutoBackup();
    }

    const distributedDevicesPerDmGroup = new Map<number, Set<string>>();
    const lastMemberCheckPerDmGroup = new Map<number, number>();
    const dmDistributionFailures = new Map<number, { count: number; backoffUntil: number }>();

    async function encryptForDM(dmGroupId: number, plaintext: string): Promise<string> {
        const serverId = getServerId();

        try {
            await ensureDmSenderKeyDistributed(dmGroupId);
        } catch (error) {
            console.error(error);
        }

        return window.api.e2ee.encrypt({
            serverId,
            type: 'dm',
            targetId: dmGroupId,
            plaintext,
        });
    }

    async function ensureDmSenderKeyDistributed(dmGroupId: number, force = false) {
        const now = Date.now();
        const lastCheck = lastMemberCheckPerDmGroup.get(dmGroupId) ?? 0;
        const hasDistributed = distributedDevicesPerDmGroup.has(dmGroupId);

        const failure = dmDistributionFailures.get(dmGroupId);
        if (failure && now < failure.backoffUntil) {
            return;
        }

        if (!force && hasDistributed && now - lastCheck < MEMBER_CHECK_INTERVAL) {
            return;
        }

        if (force) {
            distributedDevicesPerDmGroup.delete(dmGroupId);
        }

        const serverId = getServerId();
        const distribution = await window.api.e2ee.createSenderKey(serverId, -dmGroupId);
        const ourDeviceId = (await getDeviceId()) ?? '';

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
            try {
                await api.post(`/e2ee/dm-groups/${dmGroupId}/sender-keys`, {
                    device_id: ourDeviceId,
                    distribution_id: distribution.distributionId,
                    distributions: newDistributions,
                });

                dmDistributionFailures.delete(dmGroupId);
            } catch (err: any) {
                const failCount = (failure?.count ?? 0) + 1;
                const backoff = DISTRIBUTION_BACKOFF_BASE * Math.pow(2, Math.min(failCount - 1, 5));
                dmDistributionFailures.set(dmGroupId, { count: failCount, backoffUntil: Date.now() + backoff });
                throw err;
            }
        }

        const updatedSet = new Set(alreadyDistributed);
        for (const d of newDistributions) {
            updatedSet.add(d.recipient_device_id);
        }
        distributedDevicesPerDmGroup.set(dmGroupId, updatedSet);
        lastMemberCheckPerDmGroup.set(dmGroupId, Date.now());

        scheduleAutoBackup();
    }

    async function decrypt(
        encryptedContent: string,
        senderId: number,
        senderDeviceId: string,
        channelId?: number,
        dmGroupId?: number,
    ): Promise<string> {
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

    async function decryptMessage(message: MessageData, channelId?: number, dmGroupId?: number, skipFetch = false): Promise<void> {
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
            } catch (error) {
                console.error(error);
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
                    console.warn(
                        `Decryption failed after ${MAX_DECRYPT_ATTEMPTS} attempts for message ${message.id} — marking as permanently failed`,
                    );
                    message.decrypted_content = undefined;
                    message.decrypt_error = true;
                    return;
                }

                if (skipFetch) return;

                try {
                    if (dmGroupId != null) {
                        await fetchAndProcessDmSenderKeys(dmGroupId);
                    } else if (channelId != null) {
                        await fetchAndProcessSenderKeys(channelId);
                    }
                    const plaintext = await decrypt(
                        message.content,
                        message.user.id,
                        senderDeviceId,
                        channelId,
                        dmGroupId,
                    );
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

        if (message.reply_to?.is_encrypted && message.reply_to.decrypted_content === undefined && !message.reply_to.decrypt_error) {
            await decryptReplyTo(message.reply_to, channelId, dmGroupId);
        }
    }

    async function decryptReplyTo(
        reply: NonNullable<MessageData['reply_to']>,
        channelId?: number,
        dmGroupId?: number,
    ): Promise<void> {
        let senderDeviceId = '';
        try {
            const parsed = JSON.parse(reply.content);
            senderDeviceId = parsed.sender_device_id ?? '';
        } catch (error) {
            console.error(error);
        }

        try {
            const plaintext = await decrypt(reply.content, reply.user.id, senderDeviceId, channelId, dmGroupId);
            reply.decrypted_content = plaintext;
            reply.decrypt_error = false;
        } catch {
            reply.decrypt_error = true;
        }
    }

    const decryptionQueues = new Map<string, Promise<void>>();

    function enqueueDecryption(
        channelId: number | undefined,
        dmGroupId: number | undefined,
        task: () => Promise<void>,
    ): Promise<void> {
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
            const encrypted = messages.filter(
                (m) => m.is_encrypted && m.decrypted_content === undefined && !m.decrypt_error,
            );
            if (encrypted.length === 0) return;

            const needsSenderKey: MessageData[] = [];
            for (const m of encrypted) {
                await decryptMessage(m, channelId, dmGroupId, true);
                if (m.decrypted_content === undefined && !m.decrypt_error) {
                    needsSenderKey.push(m);
                }
            }

            if (needsSenderKey.length > 0) {
                try {
                    if (dmGroupId != null) {
                        await fetchAndProcessDmSenderKeys(dmGroupId, true);
                    } else if (channelId != null) {
                        await fetchAndProcessSenderKeys(channelId, true);
                    }
                } catch (error) {
                    console.error(error);
                }

                for (const m of needsSenderKey) {
                    if (m.decrypted_content !== undefined || m.decrypt_error) continue;
                    await decryptMessage(m, channelId, dmGroupId, true);
                }

                const stillPending = needsSenderKey.some(
                    (m) => m.decrypted_content === undefined && !m.decrypt_error,
                );
                if (stillPending) {
                    if (dmGroupId != null) {
                        requestDmSenderKeys(dmGroupId).catch(() => {});
                    } else if (channelId != null) {
                        requestSenderKeys(channelId).catch(() => {});
                    }
                }
            }
        });
    }

    async function decryptMessageQueued(message: MessageData, channelId?: number, dmGroupId?: number): Promise<void> {
        return enqueueDecryption(channelId, dmGroupId, async () => {
            await decryptMessage(message, channelId, dmGroupId);
        });
    }

    async function retryPendingDecryptions(
        messages: MessageData[],
        channelId?: number,
        dmGroupId?: number,
        fetchFirst = false,
    ): Promise<void> {
        const pending = messages.filter((m) => m.is_encrypted && m.decrypted_content === undefined && !m.decrypt_error);
        if (pending.length === 0) return;

        if (fetchFirst) {
            try {
                if (dmGroupId != null) {
                    await fetchAndProcessDmSenderKeys(dmGroupId);
                } else if (channelId != null) {
                    await fetchAndProcessSenderKeys(channelId);
                }
            } catch (error) {
                console.error(error);
            }
        }

        for (const m of pending) {
            await decryptMessage(m, channelId, dmGroupId);
        }
    }

    const lastSenderKeyRequestPerChannel = new Map<number, number>();
    const lastSenderKeyRequestPerDmGroup = new Map<number, number>();
    const SENDER_KEY_REQUEST_INTERVAL = 30_000;

    async function requestSenderKeys(channelId: number): Promise<void> {
        const now = Date.now();
        const last = lastSenderKeyRequestPerChannel.get(channelId) ?? 0;
        if (now - last < SENDER_KEY_REQUEST_INTERVAL) return;

        const deviceId = (await getDeviceId()) ?? '';
        if (!deviceId) return;
        lastSenderKeyRequestPerChannel.set(channelId, now);
        try {
            await api.post(`/e2ee/channels/${channelId}/request-sender-keys`, {
                device_id: deviceId,
            });
        } catch (error) {
            console.error(error);
        }
    }

    async function requestDmSenderKeys(dmGroupId: number): Promise<void> {
        const now = Date.now();
        const last = lastSenderKeyRequestPerDmGroup.get(dmGroupId) ?? 0;
        if (now - last < SENDER_KEY_REQUEST_INTERVAL) return;

        const deviceId = (await getDeviceId()) ?? '';
        if (!deviceId) return;
        lastSenderKeyRequestPerDmGroup.set(dmGroupId, now);
        try {
            await api.post(`/e2ee/dm-groups/${dmGroupId}/request-sender-keys`, {
                device_id: deviceId,
            });
        } catch (error) {
            console.error(error);
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
                if (device.device_id === ourDeviceId) continue;

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

    async function fetchAndProcessSenderKeys(channelId: number, force = false) {
        const now = Date.now();
        const lastFetch = lastSenderKeyFetchPerChannel.get(channelId) ?? 0;
        if (!force && now - lastFetch < SENDER_KEY_FETCH_INTERVAL) return;

        const existing = inFlightSenderKeyFetch.get(channelId);
        if (existing) return existing;

        const promise = _doFetchAndProcessSenderKeys(channelId).finally(() => {
            inFlightSenderKeyFetch.delete(channelId);
        });
        inFlightSenderKeyFetch.set(channelId, promise);
        return promise;
    }

    async function _doFetchAndProcessSenderKeys(channelId: number) {
        const serverId = getServerId();

        const response = await api.get(`/e2ee/channels/${channelId}/sender-keys`);
        lastSenderKeyFetchPerChannel.set(channelId, Date.now());

        const allDists: Array<{
            sender_user_id: number;
            sender_device_id: string;
            distribution_id: string;
            recipient_device_id: string;
            encrypted_distribution: string;
            ephemeral_public_key: string;
            nonce: string;
        }> = response.data ?? [];

        const processedDistributions = new Set<string>();
        for (const sk of allDists) {
            if (processedDistributions.has(sk.distribution_id)) continue;
            try {
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

                processedDistributions.add(sk.distribution_id);
            } catch (error) {
                console.error(error);
            }
        }

        if (processedDistributions.size > 0) {
            scheduleAutoBackup();
        }
    }

    async function fetchAndProcessDmSenderKeys(dmGroupId: number, force = false) {
        const now = Date.now();
        const lastFetch = lastSenderKeyFetchPerDmGroup.get(dmGroupId) ?? 0;
        if (!force && now - lastFetch < SENDER_KEY_FETCH_INTERVAL) return;

        const existing = inFlightDmSenderKeyFetch.get(dmGroupId);
        if (existing) return existing;

        const promise = _doFetchAndProcessDmSenderKeys(dmGroupId).finally(() => {
            inFlightDmSenderKeyFetch.delete(dmGroupId);
        });
        inFlightDmSenderKeyFetch.set(dmGroupId, promise);
        return promise;
    }

    async function _doFetchAndProcessDmSenderKeys(dmGroupId: number) {
        const serverId = getServerId();

        const response = await api.get(`/e2ee/dm-groups/${dmGroupId}/sender-keys`);
        lastSenderKeyFetchPerDmGroup.set(dmGroupId, Date.now());

        const allDists: Array<{
            sender_user_id: number;
            sender_device_id: string;
            distribution_id: string;
            recipient_device_id: string;
            encrypted_distribution: string;
            ephemeral_public_key: string;
            nonce: string;
        }> = response.data ?? [];

        const processedDistributions = new Set<string>();
        for (const sk of allDists) {
            if (processedDistributions.has(sk.distribution_id)) continue;
            try {
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

                processedDistributions.add(sk.distribution_id);
            } catch (error) {
                console.error(error);
            }
        }

        if (processedDistributions.size > 0) {
            scheduleAutoBackup();
        }
    }

    async function rotateSenderKey(channelId: number) {
        const serverId = getServerId();

        await window.api.e2ee.invalidateChannelSenderKeys(serverId, channelId);

        try {
            await api.delete(`/e2ee/channels/${channelId}/sender-keys`);
        } catch (error) {
            console.error(error);
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
        } catch (error) {
            console.error(error);
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

        const payload = {
            encrypted_bundle: backup.encryptedBundle,
            salt: backup.salt,
            nonce: backup.nonce,
            argon2_params: backup.argon2Params,
        };

        try {
            await api.post('/e2ee/keys/backup', payload);
        } catch (err: any) {
            if (err.response?.status === 409) {
                await api.put('/e2ee/keys/backup', payload);
            } else {
                throw err;
            }
        }

        return backup;
    }

    async function restoreKeys(pin: string): Promise<{ success: boolean; error?: string }> {
        const serverId = getServerId();

        const response = await api.get('/e2ee/keys/backup');
        const data = response.data;

        if (!data) {
            return { success: false, error: 'No backup found' };
        }

        return window.api.e2ee.restoreKeys(
            serverId,
            {
                encryptedBundle: data.encrypted_bundle,
                salt: data.salt,
                nonce: data.nonce,
                argon2Params: data.argon2_params,
            },
            pin,
        );
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

    async function autoUpdateBackup(): Promise<boolean> {
        const serverId = getServerId();
        const hasCachedKey = await window.api.e2ee.hasBackupKey(serverId);
        if (!hasCachedKey) return false;

        const backup = await window.api.e2ee.autoUpdateBackup(serverId);
        if (!backup) return false;

        const payload = {
            encrypted_bundle: backup.encryptedBundle,
            salt: backup.salt,
            nonce: backup.nonce,
            argon2_params: backup.argon2Params,
        };

        try {
            await api.put('/e2ee/keys/backup', payload);
        } catch (err: any) {
            if (err.response?.status === 404) {
                await api.post('/e2ee/keys/backup', payload);
            } else {
                throw err;
            }
        }

        return true;
    }

    async function bulkFetchSenderKeysAfterRestore(): Promise<void> {
        try {
            const categoriesResponse = await api.get('/categories');
            const categories: Array<{ channels?: Array<{ id: number }> }> = categoriesResponse.data ?? [];
            for (const cat of categories) {
                if (!cat.channels) continue;
                for (const ch of cat.channels) {
                    await fetchAndProcessSenderKeys(ch.id, true).catch(() => {});
                }
            }
        } catch (error) {
            console.error(error);
        }

        try {
            const dmsResponse = await api.get('/direct-messages');
            const dms: Array<{ id: number }> = dmsResponse.data ?? [];
            for (const dm of dms) {
                await fetchAndProcessDmSenderKeys(dm.id, true).catch(() => {});
            }
        } catch (error) {
            console.error(error);
        }
    }

    async function clearBackupKey(): Promise<void> {
        const serverId = getServerId();
        await window.api.e2ee.clearBackupKey(serverId);
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
        autoUpdateBackup,
        bulkFetchSenderKeysAfterRestore,
        clearBackupKey,
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
