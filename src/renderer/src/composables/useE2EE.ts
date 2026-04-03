import {
    registerIdentity,
    getIdentity,
    resetIdentity,
    registerDevice,
    uploadKeyPackages,
    getGroupStatus,
    getWelcomeMessages,
    claimGroup,
    submitJoinRequest,
    fulfillJoinRequest,
    getMemberBundles,
    getKeyPackages,
    postGroupMessage,
    sendWelcome,
    getGroupMessages,
    getGroupHistory,
    getUserGroups,
    backupExists as apiBackupExists,
    createBackup,
    updateBackup,
    getBackup,
    confirmBackup,
    unlockBackup as apiUnlockBackup,
    deleteBackup as apiDeleteBackup,
    fetchDevices as apiFetchDevices,
    revokeDevice as apiRevokeDevice,
    renameDevice as apiRenameDevice,
    getKeyPackageCount,
} from '@/api/e2ee';
import axios from 'axios';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import { useDirectMessagesStore } from '@/stores/directMessages';
import { useServerStore } from '@/stores/server';
import type { MessageData, EncryptedAttachmentMeta } from '@/types/chat';

export interface MessageEnvelope {
    v: 1;
    text: string;
    attachments?: EncryptedAttachmentMeta[];
}

export interface DecryptedPayload {
    text: string;
    attachments?: EncryptedAttachmentMeta[];
}

function buildEnvelope(text: string, attachments?: EncryptedAttachmentMeta[]): string {
    const envelope: MessageEnvelope = { v: 1, text };
    if (attachments && attachments.length > 0) {
        envelope.attachments = attachments;
    }
    return JSON.stringify(envelope);
}

function parsePayload(raw: string): DecryptedPayload {
    try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.v === 1 && typeof parsed.text === 'string') {
            return {
                text: parsed.text,
                attachments: parsed.attachments,
            };
        }
    } catch {
        // Not JSON — legacy plain text message
    }
    return { text: raw };
}

/** Serialize a DecryptedPayload for local cache storage. */
function serializeForCache(text: string, attachments?: EncryptedAttachmentMeta[]): string {
    if (attachments && attachments.length > 0) {
        return JSON.stringify({ __cache: 1, text, attachments });
    }
    return text;
}

/** Deserialize a cached string back to text + attachments. */
function deserializeFromCache(cached: string): DecryptedPayload {
    try {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.__cache === 1 && typeof parsed.text === 'string') {
            return { text: parsed.text, attachments: parsed.attachments };
        }
    } catch {
        // Legacy plain text cache entry
    }
    return { text: cached };
}

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
        const id = authStore.user?.id;
        return id != null ? Number(id) : undefined;
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
            await registerIdentity(result.identityKey);
        } catch (err: unknown) {
            if (axios.isAxiosError(err) && err.response?.status === 409) {
                try {
                    const existing = await getIdentity(userId);
                    if (existing?.identity_key !== result.identityKey) {
                        await resetIdentity();
                        await registerIdentity(result.identityKey);
                    }
                } catch {
                    await resetIdentity();
                    await registerIdentity(result.identityKey);
                }
            } else {
                throw err;
            }
        }

        await registerDevice(result.deviceId, result.deviceName);

        await uploadKeyPackages(result.deviceId, result.keyPackages);

        return result;
    }

    async function setupDevice(deviceName: string) {
        const serverId = getServerId();
        const userId = getUserId();
        const result = await window.api.mls.setupDevice(serverId, deviceName, userId);

        try {
            const identityData = await getIdentity(userId);
            const serverIdentityKey = identityData?.identity_key;
            if (serverIdentityKey && serverIdentityKey !== result.identityKey) {
                throw new Error('Local identity key does not match server. Please re-setup E2EE.');
            }
        } catch (err: unknown) {
            if (axios.isAxiosError(err) && err.response?.status === 404) {
                throw new Error('No identity key registered on server. Use full setup instead.');
            }
            if (err instanceof Error && err.message?.includes('does not match')) throw err;
        }

        await registerDevice(result.deviceId, result.deviceName);

        await uploadKeyPackages(result.deviceId, result.keyPackages);

        return result;
    }

    const groupReadyCache = new Map<string, number>();
    const GROUP_READY_CACHE_TTL = 5 * 60_000;
    const inFlightGroupSetup = new Map<string, Promise<void>>();
    const perGroupSetupChain = new Map<string, Promise<void>>();

    async function ensureGroupReady(groupId: string, targetId: number, type: 'channel' | 'dm'): Promise<void> {
        const now = Date.now();
        const lastCheck = groupReadyCache.get(groupId) ?? 0;
        if (now - lastCheck < GROUP_READY_CACHE_TTL) return;

        const existing = inFlightGroupSetup.get(groupId);
        if (existing) return existing;

        const prev = perGroupSetupChain.get(groupId) ?? Promise.resolve();
        const promise = new Promise<void>((resolve, reject) => {
            const chained = prev.then(
                () => _doEnsureGroupReady(groupId, targetId, type).then(resolve, reject),
                () => _doEnsureGroupReady(groupId, targetId, type).then(resolve, reject),
            );
            perGroupSetupChain.set(groupId, chained);
        }).finally(() => {
            inFlightGroupSetup.delete(groupId);
        });
        inFlightGroupSetup.set(groupId, promise);
        return promise;
    }

    async function _doEnsureGroupReady(groupId: string, targetId: number, type: 'channel' | 'dm'): Promise<void> {
        const serverId = getServerId();

        const groupInfo = await window.api.mls.getGroupInfo({ serverId, groupId });
        if (groupInfo) {
            const caught = await catchUpGroup(groupId, groupInfo.epoch);
            if (!caught) {
                console.warn('[E2EE] Catch-up failed for stale local group, deleting and rejoining:', groupId);
                await window.api.mls.deleteGroup({ serverId, groupId });
                groupReadyCache.delete(groupId);
            } else {
                groupReadyCache.set(groupId, Date.now());
                decryptGroupHistory(groupId).catch((err) => {
                    console.error(`[E2EE] History sync failed for ${groupId}:`, err);
                });
                return;
            }
        }

        const pendingWelcome = await _fetchWelcomeForGroup(groupId);
        if (pendingWelcome) {
            await _joinAndCatchUp(serverId, groupId, pendingWelcome.welcome_bytes, pendingWelcome.ratchet_tree_bytes);
            return;
        }

        const ourDeviceId = await getDeviceId();
        const encodedGroupId = encodeURIComponent(groupId);
        let groupExists = false;
        let isOwnGroup = false;

        try {
            const status = await getGroupStatus(groupId);
            groupExists = status?.exists === true;
            isOwnGroup = status?.is_own_group === true;

            if (groupExists && status?.has_welcome) {
                const welcome = await _fetchWelcomeForGroup(groupId);
                if (welcome) {
                    await _joinAndCatchUp(serverId, groupId, welcome.welcome_bytes, welcome.ratchet_tree_bytes);
                    return;
                }
            }

            if (groupExists && !isOwnGroup) {
                await _requestJoinAndWait(serverId, groupId, encodedGroupId, ourDeviceId);
                return;
            }
        } catch (statusErr) {
            console.warn('[E2EE] Group status check failed, falling back to claim:', statusErr);
        }

        await window.api.mls.createGroup({ serverId, groupId });

        try {
            await claimGroup(groupId, ourDeviceId);
        } catch (claimErr: unknown) {
            if (axios.isAxiosError(claimErr) && claimErr.response?.status === 409) {
                await window.api.mls.deleteGroup({ serverId, groupId });
                groupReadyCache.delete(groupId);

                if (claimErr.response?.data?.has_welcome) {
                    const welcome = await _fetchWelcomeForGroup(groupId);
                    if (welcome) {
                        await _joinAndCatchUp(serverId, groupId, welcome.welcome_bytes, welcome.ratchet_tree_bytes);
                        return;
                    }
                }

                await _requestJoinAndWait(serverId, groupId, encodedGroupId, ourDeviceId);
                return;
            }
            await window.api.mls.deleteGroup({ serverId, groupId });
            throw claimErr;
        }

        await _addGroupMembers(serverId, groupId, encodedGroupId, targetId, type, ourDeviceId);

        groupReadyCache.set(groupId, Date.now());
        scheduleAutoBackup();
    }

    const pendingWelcomesCache = new Map<
        string,
        { group_id: string; welcome_bytes: string; ratchet_tree_bytes: string }
    >();
    let _welcomeFetchChain: Promise<void> = Promise.resolve();

    async function _fetchWelcomeForGroup(
        groupId: string,
    ): Promise<{ group_id: string; welcome_bytes: string; ratchet_tree_bytes: string } | undefined> {
        return new Promise<{ group_id: string; welcome_bytes: string; ratchet_tree_bytes: string } | undefined>(
            (resolve) => {
                _welcomeFetchChain = _welcomeFetchChain.then(async () => {
                    const cached = pendingWelcomesCache.get(groupId);
                    if (cached) {
                        pendingWelcomesCache.delete(groupId);
                        resolve(cached);
                        return;
                    }

                    try {
                        const welcomes = await getWelcomeMessages();
                        for (const w of welcomes) {
                            pendingWelcomesCache.set(w.group_id, w);
                        }
                    } catch (error) {
                        console.error('[E2EE] Failed to fetch welcome messages:', error);
                    }

                    const result = pendingWelcomesCache.get(groupId);
                    if (result) {
                        pendingWelcomesCache.delete(groupId);
                    }
                    resolve(result);
                });
            },
        );
    }

    async function _joinAndCatchUp(
        serverId: number,
        groupId: string,
        welcomeBytes: string,
        ratchetTreeBytes: string,
    ): Promise<void> {
        await window.api.mls.joinGroup({ serverId, welcomeBytes, ratchetTreeBytes });

        const groupInfo = await window.api.mls.getGroupInfo({ serverId, groupId });
        if (groupInfo) {
            await catchUpGroup(groupId, groupInfo.epoch);
        }

        groupReadyCache.set(groupId, Date.now());
        scheduleAutoBackup();
        decryptGroupHistory(groupId).catch((err) => {
            console.error(`[E2EE] History sync failed for ${groupId}:`, err);
        });
    }

    async function _requestJoinAndWait(
        serverId: number,
        groupId: string,
        encodedGroupId: string,
        ourDeviceId: string | null,
    ): Promise<void> {
        try {
            await submitJoinRequest(groupId, ourDeviceId);
        } catch (joinReqErr) {
            console.warn('[E2EE] Failed to submit join request:', joinReqErr);
        }

        const maxAttempts = 10;
        const baseDelay = 2000;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, baseDelay * Math.min(attempt + 1, 5)));

            const existingGroup = await window.api.mls.getGroupInfo({ serverId, groupId });
            if (existingGroup) {
                groupReadyCache.set(groupId, Date.now());
                return;
            }

            const welcome = await _fetchWelcomeForGroup(groupId);
            if (welcome) {
                await _joinAndCatchUp(serverId, groupId, welcome.welcome_bytes, welcome.ratchet_tree_bytes);
                return;
            }
        }

        console.warn('[E2EE] No welcome after join-request polling, force-reclaiming group:', groupId);
        await window.api.mls.createGroup({ serverId, groupId });
        try {
            await claimGroup(groupId, ourDeviceId, true);
        } catch (reclaimErr: unknown) {
            await window.api.mls.deleteGroup({ serverId, groupId });
            if (axios.isAxiosError(reclaimErr) && reclaimErr.response?.status === 409) {
                console.warn('[E2EE] Force-reclaim blocked by grace period. Will retry on next access:', groupId);
                return;
            }
            throw reclaimErr;
        }

        const type = groupId.startsWith('dm:') ? 'dm' : 'channel';
        const targetId = Number(groupId.split(':')[1]);
        await _addGroupMembers(serverId, groupId, encodedGroupId, targetId, type, ourDeviceId);

        groupReadyCache.set(groupId, Date.now());
        scheduleAutoBackup();
    }

    async function _addGroupMembers(
        serverId: number,
        groupId: string,
        encodedGroupId: string,
        targetId: number,
        type: 'channel' | 'dm',
        ourDeviceId: string | null,
    ): Promise<void> {
        const members = await getMemberBundles(targetId, type);

        const failedMembers: Array<{ userId: number; deviceId: string; error: string }> = [];

        for (const member of members) {
            for (const device of member.devices) {
                if (device.device_id === ourDeviceId) continue;

                try {
                    const packages = await getKeyPackages(member.user_id, device.device_id);
                    const keyPackage = packages.find((p) => p.device_id === device.device_id) ?? packages[0];
                    if (!keyPackage?.key_package_bytes) {
                        console.warn(
                            `[E2EE] No key packages available for ${member.user_id}/${device.device_id}, skipping`,
                        );
                        failedMembers.push({
                            userId: member.user_id,
                            deviceId: device.device_id,
                            error: 'No key packages available',
                        });
                        continue;
                    }

                    const result = await window.api.mls.addMember({
                        serverId,
                        groupId,
                        keyPackageBytes: keyPackage.key_package_bytes,
                    });

                    try {
                        await postGroupMessage(groupId, {
                            device_id: ourDeviceId,
                            message_type: 'commit',
                            message_bytes: result.commit,
                            epoch: result.epoch,
                        });

                        const mergeResult = await window.api.mls.mergeCommit({ serverId, groupId });

                        await sendWelcome(groupId, {
                            recipient_user_id: member.user_id,
                            recipient_device_id: device.device_id,
                            welcome_bytes: result.welcome,
                            ratchet_tree_bytes: mergeResult.ratchetTree,
                        });

                        fulfillJoinRequest(groupId, device.device_id).catch(() => {});
                    } catch (serverError) {
                        await window.api.mls.clearPendingCommit({ serverId, groupId });
                        throw serverError;
                    }
                } catch (error) {
                    const errMsg = error instanceof Error ? error.message : String(error);
                    console.error(`[E2EE] Failed to add member ${member.user_id}/${device.device_id}:`, errMsg);
                    failedMembers.push({
                        userId: member.user_id,
                        deviceId: device.device_id,
                        error: errMsg,
                    });
                }
            }
        }

        if (failedMembers.length > 0) {
            console.warn(`[E2EE] Failed to add ${failedMembers.length} member(s) to group ${groupId}:`, failedMembers);
        }
    }

    async function catchUpGroup(groupId: string, currentEpoch: number): Promise<boolean> {
        const serverId = getServerId();
        try {
            const messages = await getGroupMessages(groupId, {
                since_epoch: Math.max(0, currentEpoch - 1),
                message_type: 'commit',
            });

            messages.sort((a, b) => a.epoch - b.epoch);

            const ourDeviceId = await getDeviceId();

            let processed = 0;
            for (const msg of messages) {
                if (ourDeviceId && msg.sender_device_id === ourDeviceId) {
                    continue;
                }

                try {
                    await window.api.mls.processMessage({
                        serverId,
                        groupId,
                        messageBytes: msg.message_bytes,
                    });
                    processed++;
                    currentEpoch++;
                } catch (error) {
                    const errMsg = error instanceof Error ? error.message : String(error);

                    if (errMsg.includes('epoch differs') || errMsg.includes('Message epoch')) {
                        console.debug('[E2EE] Skipping already-applied commit (epoch mismatch)');
                        currentEpoch++;
                        continue;
                    }

                    if (errMsg.includes('AEAD decryption')) {
                        console.error(
                            '[E2EE] AEAD failure on commit — possible diverged group state, aborting catch-up:',
                            error,
                        );
                        return false;
                    }

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

    async function encryptForChannel(
        channelId: number,
        plaintext: string,
        attachments?: EncryptedAttachmentMeta[],
    ): Promise<string> {
        let result!: { message_bytes: string };
        await enqueueGroupOp(channelId, undefined, async () => {
            const serverId = getServerId();
            const groupId = `channel:${channelId}`;
            await ensureGroupReady(groupId, channelId, 'channel');
            const envelope = buildEnvelope(plaintext, attachments);
            result = await window.api.mls.encrypt({ serverId, groupId, plaintext: envelope });
        });
        return result.message_bytes;
    }

    async function encryptForDM(
        dmGroupId: number,
        plaintext: string,
        attachments?: EncryptedAttachmentMeta[],
    ): Promise<string> {
        let result!: { message_bytes: string };
        await enqueueGroupOp(undefined, dmGroupId, async () => {
            const serverId = getServerId();
            const groupId = `dm:${dmGroupId}`;
            await ensureGroupReady(groupId, dmGroupId, 'dm');
            const envelope = buildEnvelope(plaintext, attachments);
            result = await window.api.mls.encrypt({ serverId, groupId, plaintext: envelope });
        });
        return result.message_bytes;
    }

    async function encryptHistory(
        groupId: string,
        plaintext: string,
        attachments?: EncryptedAttachmentMeta[],
    ): Promise<string> {
        const serverId = getServerId();
        const envelope = buildEnvelope(plaintext, attachments);
        return window.api.mls.encryptHistory({ serverId, groupId, plaintext: envelope });
    }

    async function decrypt(
        encryptedContent: string,
        channelId?: number,
        dmGroupId?: number,
        messageId?: string | number,
        userName?: string,
    ): Promise<DecryptedPayload> {
        if (!encryptedContent) {
            throw new Error('No encrypted content to decrypt');
        }
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

        const payload = parsePayload(result.payload);

        if (messageId != null) {
            const numericId = Number(messageId);
            window.api.messages
                .storeDecrypted(serverId, numericId, serializeForCache(payload.text, payload.attachments))
                .catch(() => {});
            const conversationId = dmGroupId ?? channelId;
            if (conversationId != null) {
                window.api.messages
                    .indexForSearch({
                        serverId,
                        messageId: numericId,
                        conversationType: dmGroupId != null ? 'dm' : 'channel',
                        conversationId,
                        userName: userName ?? '',
                        plaintext: payload.text,
                    })
                    .catch(() => {});
            }
        }

        return payload;
    }

    async function lookupDecryptedCache(messages: MessageData[]): Promise<void> {
        const serverId = getServerId();
        const needLookup = messages.filter((m) => m.decrypted_content === undefined && !m.decrypt_error);
        if (needLookup.length === 0) return;

        const ids = needLookup.map((m) => Number(m.id));
        try {
            const cached = await window.api.messages.getDecryptedBatch(serverId, ids);

            for (const m of needLookup) {
                const pt = cached[Number(m.id)];
                if (pt != null) {
                    const payload = deserializeFromCache(pt);
                    m.decrypted_content = payload.text;
                    m.decrypted_attachments = payload.attachments;
                    m.decrypt_error = false;
                }
            }
        } catch (err) {
            console.error('[E2EE] lookupDecryptedCache FAILED:', err);
        }
    }

    async function decryptMessage(message: MessageData, channelId?: number, dmGroupId?: number): Promise<void> {
        if (message.decrypted_content !== undefined) return;
        if (message.decrypt_error) return;
        if (!message.content) {
            console.warn('[E2EE] decryptMessage: no content for message', message.id);
            message.decrypt_error = true;
            return;
        }

        if (message.sender_device_id) {
            const ourDeviceId = await getDeviceId();
            if (ourDeviceId && message.sender_device_id === ourDeviceId) {
                const serverId = getServerId();
                const cached = await window.api.messages.getDecryptedBatch(serverId, [Number(message.id)]);
                if (cached[Number(message.id)] != null) {
                    const payload = deserializeFromCache(cached[Number(message.id)]);
                    message.decrypted_content = payload.text;
                    message.decrypted_attachments = payload.attachments;
                    message.decrypt_error = false;
                } else {
                    message.decrypt_error = true;
                }
                return;
            }
        }

        const MAX_DECRYPT_ATTEMPTS = 3;
        message.decrypt_attempts = (message.decrypt_attempts ?? 0) + 1;

        try {
            const payload = await decrypt(message.content, channelId, dmGroupId, message.id, message.user?.username);
            message.decrypted_content = payload.text;
            message.decrypted_attachments = payload.attachments;
            message.decrypt_error = false;
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.warn(
                '[E2EE] decryptMessage failed for msg',
                message.id,
                'channelId=',
                channelId,
                'dmGroupId=',
                dmGroupId,
                'error=',
                errMsg,
            );

            if (errMsg.includes('Cannot decrypt own messages')) {
                message.decrypt_error = true;
                return;
            }

            const isForwardSecrecy = errMsg.includes('forward secrecy') || errMsg.includes('Generation is too old');
            if (isForwardSecrecy) {
                const cached = await _lookupSingleDecryptedCache(message.id);
                if (cached != null) {
                    message.decrypted_content = cached.text;
                    message.decrypted_attachments = cached.attachments;
                    message.decrypt_error = false;
                } else {
                    console.warn('[E2EE] Forward secrecy — key consumed and no cache for message:', message.id);
                    message.decrypt_error = true;
                }
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
                        const serverId = getServerId();
                        const groupInfo = await window.api.mls.getGroupInfo({ serverId, groupId });
                        if (groupInfo) {
                            const caught = await catchUpGroup(groupId, groupInfo.epoch);
                            if (!caught) {
                                console.warn(
                                    '[E2EE] Catch-up failed — deleting diverged group and rejoining:',
                                    groupId,
                                );
                                await window.api.mls.deleteGroup({ serverId, groupId });
                                groupReadyCache.delete(groupId);
                                try {
                                    await ensureGroupReady(groupId, targetId, type);
                                } catch (rejoinErr) {
                                    console.error('[E2EE] Rejoin after divergence failed:', rejoinErr);
                                    const cached = await _lookupSingleDecryptedCache(message.id);
                                    if (cached != null) {
                                        message.decrypted_content = cached.text;
                                        message.decrypted_attachments = cached.attachments;
                                        message.decrypt_error = false;
                                    }
                                    return;
                                }
                            }
                        }
                    }

                    const retryPayload = await decrypt(message.content, channelId, dmGroupId, message.id);
                    message.decrypted_content = retryPayload.text;
                    message.decrypted_attachments = retryPayload.attachments;
                    message.decrypt_error = false;
                    return;
                } catch {
                    const cached = await _lookupSingleDecryptedCache(message.id);
                    if (cached != null) {
                        message.decrypted_content = cached.text;
                        message.decrypted_attachments = cached.attachments;
                        message.decrypt_error = false;
                        return;
                    }
                }
            }

            if (message.decrypt_attempts >= MAX_DECRYPT_ATTEMPTS) {
                const cached = await _lookupSingleDecryptedCache(message.id);
                if (cached != null) {
                    message.decrypted_content = cached.text;
                    message.decrypted_attachments = cached.attachments;
                    message.decrypt_error = false;
                } else {
                    message.decrypted_content = undefined;
                    message.decrypt_error = true;
                }
            }
        }

        if (message.reply_to && message.reply_to.decrypted_content === undefined && !message.reply_to.decrypt_error) {
            await decryptReplyTo(message.reply_to, channelId, dmGroupId);
        }

        if (
            message.thread?.last_reply &&
            message.thread.last_reply.decrypted_content === undefined &&
            !message.thread.last_reply.decrypt_error
        ) {
            await decryptThreadLastReply(message.thread.last_reply, channelId, dmGroupId);
        }
    }

    async function _lookupSingleDecryptedCache(messageId: string | number): Promise<DecryptedPayload | null> {
        try {
            const serverId = getServerId();
            const numId = Number(messageId);
            const cached = await window.api.messages.getDecryptedBatch(serverId, [numId]);
            if (cached[numId] == null) return null;
            return deserializeFromCache(cached[numId]);
        } catch {
            return null;
        }
    }

    async function decryptReplyTo(
        reply: NonNullable<MessageData['reply_to']>,
        channelId?: number,
        dmGroupId?: number,
    ): Promise<void> {
        try {
            const payload = await decrypt(reply.content, channelId, dmGroupId, reply.id);
            reply.decrypted_content = payload.text;
            reply.decrypt_error = false;
        } catch {
            const cached = await _lookupSingleDecryptedCache(reply.id);
            if (cached != null) {
                reply.decrypted_content = cached.text;
                reply.decrypt_error = false;
            } else {
                reply.decrypt_error = true;
            }
        }
    }

    async function decryptThreadLastReply(
        reply: NonNullable<NonNullable<MessageData['thread']>['last_reply']>,
        channelId?: number,
        dmGroupId?: number,
    ): Promise<void> {
        try {
            const payload = await decrypt(reply.content, channelId, dmGroupId, reply.id);
            reply.decrypted_content = payload.text;
            reply.decrypt_error = false;
        } catch {
            const cached = await _lookupSingleDecryptedCache(reply.id);
            if (cached != null) {
                reply.decrypted_content = cached.text;
                reply.decrypt_error = false;
            } else {
                reply.decrypt_error = true;
            }
        }
    }

    const groupOpQueues = new Map<string, Promise<void>>();

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

    const enqueueDecryption = enqueueGroupOp;

    async function decryptMessages(messages: MessageData[], channelId?: number, dmGroupId?: number): Promise<void> {
        return enqueueDecryption(channelId, dmGroupId, async () => {
            await lookupDecryptedCache(messages);

            const encrypted = messages.filter((m) => m.decrypted_content === undefined && !m.decrypt_error);
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
        const pending = messages.filter((m) => m.decrypted_content === undefined && !m.decrypt_error);
        if (pending.length === 0) return;

        return enqueueDecryption(channelId, dmGroupId, async () => {
            await lookupDecryptedCache(pending);

            const stillPending = pending.filter((m) => m.decrypted_content === undefined && !m.decrypt_error);
            for (const m of stillPending) {
                await decryptMessage(m, channelId, dmGroupId);
            }
        });
    }

    async function handleMlsMessage(
        groupId: string,
        data: { message_type: string; epoch: number; sender_device_id: string },
    ): Promise<void> {
        if (data.message_type === 'application') return;

        const ourDeviceId = await getDeviceId();
        if (ourDeviceId && data.sender_device_id === ourDeviceId) return;

        const channelId = groupId.startsWith('channel:') ? Number(groupId.slice(8)) : undefined;
        const dmGroupId = groupId.startsWith('dm:') ? Number(groupId.slice(3)) : undefined;

        return enqueueDecryption(channelId, dmGroupId, async () => {
            const serverId = getServerId();
            try {
                const groupInfo = await window.api.mls.getGroupInfo({ serverId, groupId });
                if (!groupInfo) return;

                const caught = await catchUpGroup(groupId, groupInfo.epoch);

                if (caught) {
                    let storeMessages: MessageData[] = [];
                    if (channelId != null) {
                        const chatStore = useChatStore();
                        if (Number(chatStore.currentChannel?.id) === channelId) {
                            storeMessages = chatStore.messages;
                        }
                    } else if (dmGroupId != null) {
                        const dmStore = useDirectMessagesStore();
                        if (Number(dmStore.currentDmGroup?.id) === dmGroupId) {
                            storeMessages = dmStore.messages;
                        }
                    }
                    const pending = storeMessages.filter((m) => m.decrypted_content === undefined && !m.decrypt_error);
                    for (const m of pending) {
                        await decryptMessage(m, channelId, dmGroupId);
                    }
                }
            } catch (error) {
                console.error('Failed to process MLS message:', error);
            }
        });
    }

    async function handleWelcome(): Promise<void> {
        const serverId = getServerId();
        try {
            const welcomes = await getWelcomeMessages();

            for (const w of welcomes) {
                try {
                    await _joinAndCatchUp(serverId, w.group_id, w.welcome_bytes, w.ratchet_tree_bytes);
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

    async function decryptGroupHistory(groupId: string): Promise<number> {
        const serverId = getServerId();
        const encodedGroupId = encodeURIComponent(groupId);
        const conversationType: 'channel' | 'dm' = groupId.startsWith('dm:') ? 'dm' : 'channel';
        const conversationId = Number(groupId.split(':')[1]);
        let decrypted = 0;
        let beforeId: number | undefined;

        while (true) {
            const params: Record<string, string | number> = { limit: 200 };
            if (beforeId) params.before_id = beforeId;

            const messages = await getGroupHistory(groupId, params);

            if (messages.length === 0) break;

            const batch = messages.map((m) => ({ id: m.id, ciphertext: m.history_ciphertext }));
            const results = await window.api.mls.decryptHistoryBatch({ serverId, groupId, messages: batch });

            for (const [idStr, rawPayload] of Object.entries(results)) {
                const messageId = Number(idStr);
                const payload = parsePayload(rawPayload);
                window.api.messages
                    .storeDecryptedIfAbsent(serverId, messageId, serializeForCache(payload.text, payload.attachments))
                    .catch(() => {});
                window.api.messages
                    .indexForSearch({
                        serverId,
                        messageId,
                        conversationType,
                        conversationId,
                        userName: '',
                        plaintext: payload.text,
                    })
                    .catch(() => {});
                decrypted++;
            }

            beforeId = messages[messages.length - 1].id;

            if (messages.length < 200) break;
        }

        return decrypted;
    }

    async function enrollNewDevice(newDeviceId: string): Promise<void> {
        const serverId = getServerId();
        const ourDeviceId = await getDeviceId();
        if (!ourDeviceId || newDeviceId === ourDeviceId) return;

        let groupIds: string[];
        try {
            groupIds = await getUserGroups();
        } catch (error) {
            console.error('[E2EE] Failed to fetch user groups for enrollment:', error);
            return;
        }

        const userId = getUserId();
        if (!userId) return;

        let keyPackage: { device_id: string; key_package_bytes: string; key_package_hash: string } | undefined;
        try {
            const packages = await getKeyPackages(userId, newDeviceId);
            keyPackage = packages.find((p) => p.device_id === newDeviceId) ?? packages[0];
        } catch (error) {
            console.error('[E2EE] Failed to fetch key package for new device:', error);
            return;
        }

        if (!keyPackage?.key_package_bytes) {
            console.warn('[E2EE] No key package available for new device:', newDeviceId);
            return;
        }

        let enrolledCount = 0;
        for (const groupId of groupIds) {
            const groupInfo = await window.api.mls.getGroupInfo({ serverId, groupId });
            if (!groupInfo) continue;

            const channelId = groupId.startsWith('channel:') ? Number(groupId.slice(8)) : undefined;
            const dmGroupId = groupId.startsWith('dm:') ? Number(groupId.slice(3)) : undefined;

            try {
                await enqueueGroupOp(channelId, dmGroupId, async () => {
                    let kp = keyPackage!;
                    if (enrolledCount > 0) {
                        const packages = await getKeyPackages(userId, newDeviceId);
                        kp = packages.find((p) => p.device_id === newDeviceId) ?? packages[0];
                        if (!kp?.key_package_bytes) {
                            console.warn('[E2EE] No more key packages for new device, stopping enrollment');
                            return;
                        }
                    }

                    const encodedGroupId = encodeURIComponent(groupId);
                    const result = await window.api.mls.addMember({
                        serverId,
                        groupId,
                        keyPackageBytes: kp.key_package_bytes,
                    });

                    try {
                        await postGroupMessage(groupId, {
                            device_id: ourDeviceId,
                            message_type: 'commit',
                            message_bytes: result.commit,
                            epoch: result.epoch,
                        });

                        const mergeResult = await window.api.mls.mergeCommit({ serverId, groupId });

                        await sendWelcome(groupId, {
                            recipient_user_id: userId,
                            recipient_device_id: newDeviceId,
                            welcome_bytes: result.welcome,
                            ratchet_tree_bytes: mergeResult.ratchetTree,
                        });

                        enrolledCount++;
                        console.log(`[E2EE] Enrolled new device ${newDeviceId} into group ${groupId}`);
                    } catch (serverError) {
                        await window.api.mls.clearPendingCommit({ serverId, groupId });
                        throw serverError;
                    }
                });
            } catch (error) {
                console.error(`[E2EE] Failed to enroll device ${newDeviceId} in group ${groupId}:`, error);
            }
        }

        if (enrolledCount > 0) {
            scheduleAutoBackup();
            console.log(`[E2EE] Enrolled new device ${newDeviceId} into ${enrolledCount} groups`);
        }
    }

    async function handleJoinRequest(
        groupId: string,
        requesterUserId: number,
        requesterDeviceId: string,
    ): Promise<void> {
        const serverId = getServerId();
        const ourDeviceId = await getDeviceId();
        if (!ourDeviceId) return;

        const setupInFlight = inFlightGroupSetup.get(groupId);
        if (setupInFlight) {
            await setupInFlight.catch(() => {});
        }

        const groupInfo = await window.api.mls.getGroupInfo({ serverId, groupId });
        if (!groupInfo) {
            console.debug(`[E2EE] Ignoring join request for group ${groupId} — not in local storage`);
            return;
        }

        const channelId = groupId.startsWith('channel:') ? Number(groupId.slice(8)) : undefined;
        const dmGroupId = groupId.startsWith('dm:') ? Number(groupId.slice(3)) : undefined;

        await enqueueGroupOp(channelId, dmGroupId, async () => {
            const freshGroupInfo = await window.api.mls.getGroupInfo({ serverId, groupId });
            if (!freshGroupInfo) {
                console.debug(`[E2EE] Group ${groupId} disappeared before handling join request`);
                return;
            }

            const requesterIdentity = `${requesterUserId}:${requesterDeviceId}`;
            const alreadyMember = freshGroupInfo.members.some(
                (m: { identity: string }) => m.identity === requesterIdentity,
            );
            if (alreadyMember) {
                console.debug(`[E2EE] Requester ${requesterIdentity} already in group ${groupId}, skipping add`);
                fulfillJoinRequest(groupId, requesterDeviceId).catch(() => {});
                return;
            }

            let keyPackage: { device_id: string; key_package_bytes: string } | undefined;
            try {
                const packages = await getKeyPackages(requesterUserId, requesterDeviceId);
                keyPackage = packages.find((p) => p.device_id === requesterDeviceId) ?? packages[0];
            } catch (error) {
                console.error('[E2EE] Failed to fetch key package for join requester:', error);
                return;
            }

            if (!keyPackage?.key_package_bytes) {
                console.warn(`[E2EE] No key package for join requester ${requesterUserId}/${requesterDeviceId}`);
                return;
            }

            const encodedGroupId = encodeURIComponent(groupId);

            const result = await window.api.mls.addMember({
                serverId,
                groupId,
                keyPackageBytes: keyPackage.key_package_bytes,
            });

            try {
                await postGroupMessage(groupId, {
                    device_id: ourDeviceId,
                    message_type: 'commit',
                    message_bytes: result.commit,
                    epoch: result.epoch,
                });

                const mergeResult = await window.api.mls.mergeCommit({ serverId, groupId });

                await sendWelcome(groupId, {
                    recipient_user_id: requesterUserId,
                    recipient_device_id: requesterDeviceId,
                    welcome_bytes: result.welcome,
                    ratchet_tree_bytes: mergeResult.ratchetTree,
                });

                fulfillJoinRequest(groupId, requesterDeviceId).catch(() => {});

                console.log(`[E2EE] Fulfilled join request for ${requesterUserId}/${requesterDeviceId} in ${groupId}`);
                scheduleAutoBackup();
            } catch (serverError) {
                await window.api.mls.clearPendingCommit({ serverId, groupId });
                throw serverError;
            }
        });
    }

    async function backupExists(): Promise<boolean> {
        return apiBackupExists();
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
            await createBackup(payload);
        } catch (err: unknown) {
            if (axios.isAxiosError(err) && err.response?.status === 409) {
                await updateBackup(payload);
            } else {
                throw err;
            }
        }

        return backup;
    }

    async function restoreKeys(pin: string): Promise<{ success: boolean; error?: string }> {
        const serverId = getServerId();

        let data;
        try {
            data = await getBackup();
        } catch (err: unknown) {
            if (axios.isAxiosError(err) && err.response?.status === 423) {
                const lockData = err.response.data as { remaining_minutes?: number };
                const remaining = lockData?.remaining_minutes ?? 60;
                return {
                    success: false,
                    error: `Backup access is locked due to too many failed attempts. Try again in ${remaining} minutes or unlock via 2FA.`,
                };
            }
            throw err;
        }

        if (!data) {
            return { success: false, error: 'No backup found' };
        }

        const result = await window.api.mls.restoreKeys(
            serverId,
            {
                encryptedBundle: data.encrypted_bundle,
                salt: data.salt,
                nonce: data.nonce,
                argon2Params: data.argon2_params,
            },
            pin,
            getUserId(),
        );

        if (result.success) {
            try {
                await confirmBackup();
            } catch {
                // Non-fatal — counter reset is best-effort
            }
        }

        return result;
    }

    async function unlockBackup(twoFactorCode: string): Promise<{ success: boolean; error?: string }> {
        try {
            await apiUnlockBackup(twoFactorCode);
            return { success: true };
        } catch (err: unknown) {
            return {
                success: false,
                error: axios.isAxiosError(err) ? err.response?.data?.message ?? 'Failed to unlock backup' : 'Failed to unlock backup',
            };
        }
    }

    async function deleteBackup() {
        await apiDeleteBackup();
    }

    async function fetchDevices() {
        return apiFetchDevices();
    }

    async function ensureDeviceRegistered(): Promise<void> {
        const deviceId = await getDeviceId();
        if (!deviceId) return;

        const devices = await fetchDevices();
        const exists = devices.some((d: { device_id: string }) => d.device_id === deviceId);
        if (exists) return;

        const userId = getUserId();
        if (userId) {
            try {
                await getIdentity(userId);
            } catch (err: unknown) {
                if (axios.isAxiosError(err) && err.response?.status === 404) {
                    await wipe();
                    throw new Error('Server E2EE state was reset. Please set up E2EE again.');
                }
            }
        }

        try {
            await registerDevice(deviceId, 'Re-registered device');
        } catch (err: unknown) {
            if (axios.isAxiosError(err) && err.response?.status === 409) {
                return;
            }
            throw err;
        }
    }

    async function revokeDevice(deviceId: string) {
        await apiRevokeDevice(deviceId);
    }

    async function renameDevice(deviceId: string, name: string) {
        await apiRenameDevice(deviceId, name);
    }

    async function checkAndReplenishKeyPackages(threshold = 25, replenishCount = 75) {
        const serverId = getServerId();
        const deviceId = await getDeviceId();
        if (!deviceId) return { replenished: false, currentCount: 0 };

        let count: number;
        try {
            count = await getKeyPackageCount();
        } catch (err: unknown) {
            if (axios.isAxiosError(err) && err.response?.status === 404) {
                return { replenished: false, currentCount: 0 };
            }
            throw err;
        }

        if (count < threshold) {
            const keyPackages = await window.api.mls.generateKeyPackages(serverId, replenishCount);
            await uploadKeyPackages(deviceId, keyPackages);
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
            await updateBackup(payload);
        } catch (err: unknown) {
            if (axios.isAxiosError(err) && err.response?.status === 404) {
                await createBackup(payload);
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

    async function changePIN(oldPin: string, newPin: string): Promise<{ success: boolean; error?: string }> {
        const serverId = getServerId();

        let data;
        try {
            data = await getBackup();
        } catch (err: unknown) {
            if (axios.isAxiosError(err) && err.response?.status === 423) {
                return { success: false, error: 'Backup is locked. Unlock via 2FA first.' };
            }
            return { success: false, error: 'Failed to fetch backup' };
        }
        if (!data) {
            return { success: false, error: 'No backup found to change PIN for' };
        }

        // Decrypt with old PIN, re-encrypt with new PIN
        const result = await window.api.mls.changePIN(
            serverId,
            {
                encryptedBundle: data.encrypted_bundle,
                salt: data.salt,
                nonce: data.nonce,
                argon2Params: data.argon2_params,
            },
            oldPin,
            newPin,
        );

        if (!result.success) {
            return { success: false, error: result.error ?? 'Wrong PIN' };
        }

        const backup = result.backup!;
        const payload = {
            encrypted_bundle: backup.encryptedBundle,
            salt: backup.salt,
            nonce: backup.nonce,
            argon2_params: backup.argon2Params,
        };

        try {
            await updateBackup(payload);
        } catch {
            return { success: false, error: 'Failed to upload re-encrypted backup' };
        }

        try {
            await confirmBackup();
        } catch {
            // Non-fatal
        }

        return { success: true };
    }

    async function cacheDecryptedContent(
        messageId: number,
        plaintext: string,
        metadata?: { conversationType: 'channel' | 'dm'; conversationId: number; userName: string },
        attachments?: EncryptedAttachmentMeta[],
    ): Promise<void> {
        const serverId = getServerId();
        await window.api.messages.storeDecrypted(serverId, messageId, serializeForCache(plaintext, attachments));
        if (metadata) {
            window.api.messages
                .indexForSearch({
                    serverId,
                    messageId,
                    ...metadata,
                    plaintext,
                })
                .catch(() => {});
        }
    }

    async function removeFromSearchIndex(messageId: number): Promise<void> {
        const serverId = getServerId();
        await window.api.messages.removeFromSearchIndex(serverId, messageId);
    }

    return {
        isSetup,
        getDeviceId,
        setup,
        setupDevice,
        encryptForChannel,
        encryptForDM,
        encryptHistory,
        decrypt,
        decryptMessage,
        decryptMessageQueued,
        decryptMessages,
        retryPendingDecryptions,
        ensureGroupReady,
        handleMlsMessage,
        handleWelcome,
        handleJoinRequest,
        enrollNewDevice,
        decryptGroupHistory,
        backupExists,
        backupKeys,
        restoreKeys,
        autoUpdateBackup,
        clearBackupKey,
        deleteBackup,
        unlockBackup,
        changePIN,
        ensureDeviceRegistered,
        fetchDevices,
        revokeDevice,
        renameDevice,
        checkAndReplenishKeyPackages,
        wipe,
        wipeIfUserChanged,
        cacheDecryptedContent,
        removeFromSearchIndex,
        lookupDecryptedCache,
    };
}
