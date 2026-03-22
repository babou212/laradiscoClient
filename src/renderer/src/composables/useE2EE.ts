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

    function groupIdFor(channelId?: number, dmGroupId?: number): string {
        if (dmGroupId != null) return `dm:${dmGroupId}`;
        if (channelId != null) return `channel:${channelId}`;
        throw new Error('Must provide channelId or dmGroupId');
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
        return window.api.mls.isSetup(getServerId(), getUserId());
    }

    async function getDeviceId(): Promise<string | null> {
        return window.api.mls.getDeviceId(getServerId(), getUserId());
    }

    async function setup(deviceName: string) {
        const serverId = getServerId();
        const userId = getUserId();
        const result = await window.api.mls.setup(serverId, deviceName, userId);

        try {
            await api.post('/e2ee/identity/register', {
                identity_key: result.identityKey,
            });
        } catch (err: any) {
            if (err.response?.status === 409) {
                try {
                    const existing = await api.get(`/e2ee/identity/${userId}`);
                    if (existing.data?.identity_key !== result.identityKey) {
                        await api.delete('/e2ee/identity/reset');
                        await api.post('/e2ee/identity/register', {
                            identity_key: result.identityKey,
                        });
                    }
                } catch {
                    await api.delete('/e2ee/identity/reset');
                    await api.post('/e2ee/identity/register', {
                        identity_key: result.identityKey,
                    });
                }
            } else {
                throw err;
            }
        }

        await api.post('/e2ee/devices/register', {
            device_id: result.deviceId,
            device_name: result.deviceName,
        });

        await api.post('/e2ee/mls/key-packages', {
            device_id: result.deviceId,
            key_packages: result.keyPackages,
        });

        return result;
    }

    async function setupDevice(deviceName: string) {
        const serverId = getServerId();
        const userId = getUserId();
        const result = await window.api.mls.setupDevice(serverId, deviceName, userId);

        try {
            const identityResponse = await api.get(`/e2ee/identity/${userId}`);
            const serverIdentityKey = identityResponse.data?.identity_key;
            if (serverIdentityKey && serverIdentityKey !== result.identityKey) {
                throw new Error('Local identity key does not match server. Please re-setup E2EE.');
            }
        } catch (err: any) {
            if (err.response?.status === 404) {
                throw new Error('No identity key registered on server. Use full setup instead.');
            }
            if (err.message?.includes('does not match')) throw err;
        }

        await api.post('/e2ee/devices/register', {
            device_id: result.deviceId,
            device_name: result.deviceName,
        });

        await api.post('/e2ee/mls/key-packages', {
            device_id: result.deviceId,
            key_packages: result.keyPackages,
        });

        return result;
    }

    const groupReadyCache = new Map<string, number>();
    const GROUP_READY_CACHE_TTL = 5 * 60_000;
    const inFlightGroupSetup = new Map<string, Promise<void>>();

    async function ensureGroupReady(groupId: string, targetId: number, type: 'channel' | 'dm'): Promise<void> {
        const now = Date.now();
        const lastCheck = groupReadyCache.get(groupId) ?? 0;
        if (now - lastCheck < GROUP_READY_CACHE_TTL) return;

        const existing = inFlightGroupSetup.get(groupId);
        if (existing) return existing;

        const promise = _doEnsureGroupReady(groupId, targetId, type).finally(() => {
            inFlightGroupSetup.delete(groupId);
        });
        inFlightGroupSetup.set(groupId, promise);
        return promise;
    }

    async function _doEnsureGroupReady(groupId: string, targetId: number, type: 'channel' | 'dm'): Promise<void> {
        const serverId = getServerId();

        const groupInfo = await window.api.mls.getGroupInfo({ serverId, groupId });
        if (groupInfo) {
            groupReadyCache.set(groupId, Date.now());
            await catchUpGroup(groupId, groupInfo.epoch);
            return;
        }

        try {
            const welcomeResponse = await api.get('/e2ee/mls/welcome');
            const welcomes: Array<{
                id: number;
                group_id: string;
                welcome_bytes: string;
                ratchet_tree_bytes: string;
            }> = welcomeResponse.data ?? [];

            const matching = welcomes.find((w) => w.group_id === groupId);
            if (matching) {
                await window.api.mls.joinGroup({
                    serverId,
                    welcomeBytes: matching.welcome_bytes,
                    ratchetTreeBytes: matching.ratchet_tree_bytes,
                });
                groupReadyCache.set(groupId, Date.now());
                scheduleAutoBackup();
                return;
            }
        } catch (error) {
            console.error('Failed to fetch welcome messages:', error);
        }

        await window.api.mls.createGroup({ serverId, groupId });

        const membersEndpoint =
            type === 'dm'
                ? `/e2ee/dm-groups/${targetId}/members/bundles`
                : `/e2ee/channels/${targetId}/members/bundles`;

        const membersResponse = await api.get(membersEndpoint);
        const members: Array<{
            user_id: number;
            devices: Array<{ device_id: string }>;
        }> = membersResponse.data ?? [];

        const ourDeviceId = await getDeviceId();
        const encodedGroupId = encodeURIComponent(groupId);

        for (const member of members) {
            for (const device of member.devices) {
                if (device.device_id === ourDeviceId) continue;

                try {
                    const kpResponse = await api.get(`/e2ee/mls/key-packages/${member.user_id}`, {
                        params: { device_id: device.device_id },
                    });
                    const packages = kpResponse.data ?? [];
                    const keyPackage = packages.find((p: any) => p.device_id === device.device_id) ?? packages[0];
                    if (!keyPackage?.key_package_bytes) continue;

                    const result = await window.api.mls.addMember({
                        serverId,
                        groupId,
                        keyPackageBytes: keyPackage.key_package_bytes,
                    });

                    try {
                        await api.post(`/e2ee/mls/groups/${encodedGroupId}/messages`, {
                            device_id: ourDeviceId,
                            message_type: 'commit',
                            message_bytes: result.commit,
                            epoch: result.epoch,
                        });

                        await api.post(`/e2ee/mls/groups/${encodedGroupId}/welcome`, {
                            recipient_user_id: member.user_id,
                            recipient_device_id: device.device_id,
                            welcome_bytes: result.welcome,
                            ratchet_tree_bytes: result.ratchetTree,
                        });

                        // Server accepted — now safe to merge locally
                        await window.api.mls.mergeCommit({ serverId, groupId });
                    } catch (serverError) {
                        // Server rejected — roll back the pending commit
                        await window.api.mls.clearPendingCommit({ serverId, groupId });
                        throw serverError;
                    }
                } catch (error) {
                    console.error(`Failed to add member ${member.user_id}/${device.device_id}:`, error);
                }
            }
        }

        groupReadyCache.set(groupId, Date.now());
        scheduleAutoBackup();
    }

    async function catchUpGroup(groupId: string, currentEpoch: number): Promise<boolean> {
        const serverId = getServerId();
        const ourDeviceId = await getDeviceId();
        try {
            const response = await api.get(`/e2ee/mls/groups/${encodeURIComponent(groupId)}/messages`, {
                params: { since_epoch: currentEpoch, message_type: 'commit' },
            });
            const messages: Array<{ message_bytes: string; sender_device_id: string }> = response.data ?? [];

            let processed = 0;
            for (const msg of messages) {
                try {
                    await window.api.mls.processMessage({
                        serverId,
                        groupId,
                        messageBytes: msg.message_bytes,
                    });
                    processed++;
                } catch (error) {
                    const errMsg = error instanceof Error ? error.message : String(error);

                    // Own commits that were already applied locally will fail —
                    // this is expected and safe to skip.
                    if (ourDeviceId && msg.sender_device_id === ourDeviceId) {
                        console.debug('[E2EE] Skipping already-applied own commit');
                        continue;
                    }

                    // AEAD decryption errors on non-own commits typically mean the
                    // commit was already processed (e.g. the server returned it
                    // again because the since_epoch filter is inclusive of the
                    // current epoch). Check if the group has advanced past it —
                    // if so, it's safe to skip and continue with the next commit.
                    if (errMsg.includes('AEAD decryption')) {
                        const groupInfo = await window.api.mls.getGroupInfo({ serverId, groupId });
                        if (groupInfo && groupInfo.epoch > currentEpoch) {
                            console.debug('[E2EE] Skipping already-processed commit (AEAD error, epoch advanced)');
                            currentEpoch = groupInfo.epoch;
                            continue;
                        }
                    }

                    // A non-own commit genuinely failed — subsequent commits depend
                    // on this one, so stop processing to avoid corrupting group state.
                    console.error('[E2EE] Failed to process commit, aborting catch-up:', error);
                    return false;
                }
            }

            if (processed > 0) {
                scheduleAutoBackup();
            }
            return true;
        } catch (error) {
            console.error('[E2EE] Failed to catch up group:', error);
            return false;
        }
    }

    async function encryptForChannel(channelId: number, plaintext: string): Promise<string> {
        let result!: { message_bytes: string };
        await enqueueGroupOp(channelId, undefined, async () => {
            const serverId = getServerId();
            const groupId = `channel:${channelId}`;
            await ensureGroupReady(groupId, channelId, 'channel');
            result = await window.api.mls.encrypt({ serverId, groupId, plaintext });
        });
        return result.message_bytes;
    }

    async function encryptForDM(dmGroupId: number, plaintext: string): Promise<string> {
        let result!: { message_bytes: string };
        await enqueueGroupOp(undefined, dmGroupId, async () => {
            const serverId = getServerId();
            const groupId = `dm:${dmGroupId}`;
            await ensureGroupReady(groupId, dmGroupId, 'dm');
            result = await window.api.mls.encrypt({ serverId, groupId, plaintext });
        });
        return result.message_bytes;
    }

    async function decrypt(encryptedContent: string, channelId?: number, dmGroupId?: number): Promise<string> {
        const serverId = getServerId();
        const groupId = groupIdFor(channelId, dmGroupId);

        const result = await window.api.mls.decrypt({
            serverId,
            groupId,
            messageBytes: encryptedContent,
        });

        if (result.payload == null) {
            throw new Error('Decryption returned no payload');
        }

        return result.payload;
    }

    async function decryptMessage(message: MessageData, channelId?: number, dmGroupId?: number): Promise<void> {
        if (!message.is_encrypted) return;
        if (message.decrypted_content !== undefined) return;
        if (message.decrypt_error) return;

        // MLS cannot decrypt messages sent by our own device — the protocol
        // excludes the sender from the recipient list by design.
        if (message.sender_device_id) {
            const ourDeviceId = await getDeviceId();
            if (ourDeviceId && message.sender_device_id === ourDeviceId) {
                message.decrypt_error = true;
                return;
            }
        }

        const MAX_DECRYPT_ATTEMPTS = 3;
        message.decrypt_attempts = (message.decrypt_attempts ?? 0) + 1;

        try {
            const plaintext = await decrypt(message.content, channelId, dmGroupId);
            message.decrypted_content = plaintext;
            message.decrypt_error = false;
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);

            // Own-message error is not retryable — fail immediately
            if (errMsg.includes('Cannot decrypt own messages')) {
                message.decrypt_error = true;
                return;
            }

            // Generation too old means the ratchet key was already consumed
            // (duplicate message or message arrived after its generation was
            // skipped). Catching up can't fix this — fail immediately.
            if (errMsg.includes('Generation is too old')) {
                console.warn('[E2EE] Generation too old (message already processed or skipped):', message.id);
                message.decrypt_error = true;
                return;
            }

            const isGroupNotFound = errMsg.includes('group not found') || errMsg.includes('not found in storage');
            const isEpochMismatch = errMsg.includes('epoch differs') || errMsg.includes('AEAD decryption');

            if ((isGroupNotFound || isEpochMismatch) && message.decrypt_attempts < MAX_DECRYPT_ATTEMPTS) {
                try {
                    const groupId = groupIdFor(channelId, dmGroupId);
                    const targetId = dmGroupId ?? channelId!;
                    const type = dmGroupId != null ? 'dm' : 'channel';

                    if (isGroupNotFound) {
                        groupReadyCache.delete(groupId);
                        await ensureGroupReady(groupId, targetId, type);
                    } else {
                        // Epoch mismatch or AEAD error — catch up on missed commits
                        const serverId = getServerId();
                        const groupInfo = await window.api.mls.getGroupInfo({ serverId, groupId });
                        if (groupInfo) {
                            const caught = await catchUpGroup(groupId, groupInfo.epoch);
                            if (!caught) {
                                // Catch-up failed — don't waste a retry
                                return;
                            }
                        }
                    }

                    const plaintext = await decrypt(message.content, channelId, dmGroupId);
                    message.decrypted_content = plaintext;
                    message.decrypt_error = false;
                    return;
                } catch {
                    // Still can't decrypt after catching up
                }
            }

            if (message.decrypt_attempts >= MAX_DECRYPT_ATTEMPTS) {
                message.decrypted_content = undefined;
                message.decrypt_error = true;
            }
        }

        if (
            message.reply_to?.is_encrypted &&
            message.reply_to.decrypted_content === undefined &&
            !message.reply_to.decrypt_error
        ) {
            await decryptReplyTo(message.reply_to, channelId, dmGroupId);
        }

        if (
            message.thread?.last_reply?.is_encrypted &&
            message.thread.last_reply.decrypted_content === undefined &&
            !message.thread.last_reply.decrypt_error
        ) {
            await decryptThreadLastReply(message.thread.last_reply, channelId, dmGroupId);
        }
    }

    async function decryptReplyTo(
        reply: NonNullable<MessageData['reply_to']>,
        channelId?: number,
        dmGroupId?: number,
    ): Promise<void> {
        try {
            const plaintext = await decrypt(reply.content, channelId, dmGroupId);
            reply.decrypted_content = plaintext;
            reply.decrypt_error = false;
        } catch {
            reply.decrypt_error = true;
        }
    }

    async function decryptThreadLastReply(
        reply: NonNullable<NonNullable<MessageData['thread']>['last_reply']>,
        channelId?: number,
        dmGroupId?: number,
    ): Promise<void> {
        try {
            const plaintext = await decrypt(reply.content, channelId, dmGroupId);
            reply.decrypted_content = plaintext;
            reply.decrypt_error = false;
        } catch {
            reply.decrypt_error = true;
        }
    }

    const groupOpQueues = new Map<string, Promise<void>>();

    /**
     * Serializes all MLS operations (decrypt, encrypt, commit processing) for
     * the same group. This prevents race conditions where a commit advances the
     * epoch while a decrypt is in flight, or two concurrent decrypts consume
     * the same ratchet generation.
     */
    function enqueueGroupOp(
        channelId: number | undefined,
        dmGroupId: number | undefined,
        task: () => Promise<void>,
    ): Promise<void> {
        const key = dmGroupId ? `group-dm-${dmGroupId}` : `group-${channelId ?? 'unknown'}`;
        const prev = groupOpQueues.get(key) ?? Promise.resolve();
        const next = prev.then(task, task);
        groupOpQueues.set(key, next);
        next.finally(() => {
            if (groupOpQueues.get(key) === next) {
                groupOpQueues.delete(key);
            }
        });
        return next;
    }

    // Backwards-compatible alias
    const enqueueDecryption = enqueueGroupOp;

    async function decryptMessages(messages: MessageData[], channelId?: number, dmGroupId?: number): Promise<void> {
        return enqueueDecryption(channelId, dmGroupId, async () => {
            const encrypted = messages.filter(
                (m) => m.is_encrypted && m.decrypted_content === undefined && !m.decrypt_error,
            );
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

    async function retryPendingDecryptions(
        messages: MessageData[],
        channelId?: number,
        dmGroupId?: number,
    ): Promise<void> {
        const pending = messages.filter((m) => m.is_encrypted && m.decrypted_content === undefined && !m.decrypt_error);
        if (pending.length === 0) return;

        return enqueueDecryption(channelId, dmGroupId, async () => {
            for (const m of pending) {
                await decryptMessage(m, channelId, dmGroupId);
            }
        });
    }

    async function handleMlsMessage(
        groupId: string,
        data: { message_type: string; epoch: number; sender_device_id: string },
    ): Promise<void> {
        // Application messages are decrypted on-demand via decrypt() — nothing to do here.
        // Only commit/proposal messages need processing to advance group state.
        if (data.message_type === 'application') return;

        // Ignore our own commits — we already merged them locally.
        const ourDeviceId = await getDeviceId();
        if (ourDeviceId && data.sender_device_id === ourDeviceId) return;

        // Parse groupId to get channelId/dmGroupId for queue key
        const channelId = groupId.startsWith('channel:') ? Number(groupId.slice(8)) : undefined;
        const dmGroupId = groupId.startsWith('dm:') ? Number(groupId.slice(3)) : undefined;

        // Serialize commit processing with decryptions to prevent epoch
        // from advancing while a decrypt is in flight.
        return enqueueDecryption(channelId, dmGroupId, async () => {
            const serverId = getServerId();
            try {
                const groupInfo = await window.api.mls.getGroupInfo({ serverId, groupId });
                if (!groupInfo) return;

                await catchUpGroup(groupId, groupInfo.epoch);
            } catch (error) {
                console.error('Failed to process MLS message:', error);
            }
        });
    }

    async function handleWelcome(): Promise<void> {
        const serverId = getServerId();
        try {
            const response = await api.get('/e2ee/mls/welcome');
            const welcomes: Array<{
                group_id: string;
                welcome_bytes: string;
                ratchet_tree_bytes: string;
            }> = response.data ?? [];

            for (const w of welcomes) {
                try {
                    await window.api.mls.joinGroup({
                        serverId,
                        welcomeBytes: w.welcome_bytes,
                        ratchetTreeBytes: w.ratchet_tree_bytes,
                    });
                    groupReadyCache.set(w.group_id, Date.now());
                } catch (error) {
                    console.error(`Failed to join group ${w.group_id}:`, error);
                }
            }

            if (welcomes.length > 0) {
                scheduleAutoBackup();
            }
        } catch (error) {
            console.error('Failed to fetch welcome messages:', error);
        }
    }

    async function backupExists(): Promise<boolean> {
        const response = await api.get('/e2ee/keys/backup/exists');
        return response.data?.exists ?? false;
    }

    async function backupKeys(pin: string) {
        const serverId = getServerId();
        const backup = await window.api.mls.backupKeys(serverId, pin);

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

        return window.api.mls.restoreKeys(
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

    async function ensureDeviceRegistered(): Promise<void> {
        const deviceId = await getDeviceId();
        if (!deviceId) return;

        const devices = await fetchDevices();
        const exists = devices.some((d: { device_id: string }) => d.device_id === deviceId);
        if (exists) return;

        // Device missing server-side — re-register it
        try {
            await api.post('/e2ee/devices/register', {
                device_id: deviceId,
                device_name: 'Re-registered device',
            });
        } catch (err: any) {
            if (err.response?.status === 409) {
                // Already registered (race condition), ignore
                return;
            }
            throw err;
        }
    }

    async function revokeDevice(deviceId: string) {
        await api.delete(`/e2ee/devices/${deviceId}`);
    }

    async function renameDevice(deviceId: string, name: string) {
        await api.put(`/e2ee/devices/${deviceId}/name`, { device_name: name });
    }

    async function checkAndReplenishKeyPackages(threshold = 25, replenishCount = 75) {
        const serverId = getServerId();
        const deviceId = await getDeviceId();
        if (!deviceId) return { replenished: false, currentCount: 0 };

        let count: number;
        try {
            const response = await api.get('/e2ee/mls/key-packages/count');
            count = response.data?.count ?? 0;
        } catch (err: any) {
            if (err.response?.status === 404) {
                return { replenished: false, currentCount: 0 };
            }
            throw err;
        }

        if (count < threshold) {
            const keyPackages = await window.api.mls.generateKeyPackages(serverId, replenishCount);
            await api.post('/e2ee/mls/key-packages', {
                device_id: deviceId,
                key_packages: keyPackages,
            });
            return { replenished: true, newCount: count + replenishCount };
        }

        return { replenished: false, currentCount: count };
    }

    async function wipe() {
        const serverId = getServerId();
        await window.api.mls.wipe(serverId);
    }

    async function wipeIfUserChanged(): Promise<boolean> {
        const serverId = getServerId();
        const userId = getUserId();
        if (!userId) return false;
        return window.api.mls.wipeForUserMismatch(serverId, userId);
    }

    async function autoUpdateBackup(): Promise<boolean> {
        const serverId = getServerId();
        const hasCachedKey = await window.api.mls.hasBackupKey(serverId);
        if (!hasCachedKey) return false;

        const backup = await window.api.mls.autoUpdateBackup(serverId);
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

    async function clearBackupKey(): Promise<void> {
        const serverId = getServerId();
        await window.api.mls.clearBackupKey(serverId);
    }

    async function storeSentPlaintext(messageId: number, plaintext: string): Promise<void> {
        const serverId = getServerId();
        await window.api.messages.storePlaintext(serverId, messageId, plaintext);
    }

    async function lookupSentPlaintexts(messages: MessageData[]): Promise<void> {
        const serverId = getServerId();
        const ownDeviceId = await getDeviceId();
        if (!ownDeviceId) return;

        const ownEncrypted = messages.filter(
            (m) =>
                m.is_encrypted &&
                m.decrypted_content === undefined &&
                !m.decrypt_error &&
                m.sender_device_id === ownDeviceId,
        );
        if (ownEncrypted.length === 0) return;

        const ids = ownEncrypted.map((m) => m.id);
        const plaintexts = await window.api.messages.getPlaintexts(serverId, ids);

        for (const m of ownEncrypted) {
            const pt = plaintexts[m.id];
            if (pt != null) {
                m.decrypted_content = pt;
                m.decrypt_error = false;
            }
        }
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
        retryPendingDecryptions,
        ensureGroupReady,
        handleMlsMessage,
        handleWelcome,
        backupExists,
        backupKeys,
        restoreKeys,
        autoUpdateBackup,
        clearBackupKey,
        deleteBackup,
        ensureDeviceRegistered,
        fetchDevices,
        revokeDevice,
        renameDevice,
        checkAndReplenishKeyPackages,
        wipe,
        wipeIfUserChanged,
        storeSentPlaintext,
        lookupSentPlaintexts,
    };
}
