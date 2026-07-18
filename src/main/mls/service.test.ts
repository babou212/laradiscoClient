import { existsSync, unlinkSync } from 'fs';
import { generateKeyPairSync } from 'node:crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Shared in-memory state for the mocked DB layer (hoisted so vi.mock can see it).
const state = vi.hoisted(() => ({
    settings: new Map<string, string>(),
    groups: new Map<string, { group_id: string; epoch: number; last_message_id: number; updated_at: string }>(),
    decrypted: new Map<string, string>(),
    peers: new Map<string, { identity_key: string; verified: boolean }>(),
}));

vi.mock('../database', () => ({
    getSetting: (k: string) => state.settings.get(k) ?? null,
    setSetting: (k: string, v: string) => state.settings.set(k, v),
    getMlsGroup: (id: string) => state.groups.get(id) ?? null,
    upsertMlsGroup: (id: string, epoch: number, last: number) =>
        state.groups.set(id, { group_id: id, epoch, last_message_id: last, updated_at: 'now' }),
    listMlsGroups: () => [...state.groups.values()],
    getDecryptedMessage: (id: string) => state.decrypted.get(id) ?? null,
    putDecryptedMessage: (id: string, _g: string, content: string) => state.decrypted.set(id, content),
    listDecryptedMessages: () =>
        [...state.decrypted.entries()].map(([message_id, content]) => ({
            message_id,
            group_id: 'dm:1',
            content,
            created_at: 'now',
        })),
    getPeerIdentity: (id: string) => (state.peers.has(id) ? { user_id: id, ...state.peers.get(id)! } : null),
    pinPeerIdentity: (id: string, key: string): 'new' | 'unchanged' | 'changed' => {
        const existing = state.peers.get(id);
        if (!existing) {
            state.peers.set(id, { identity_key: key, verified: false });
            return 'new';
        }
        if (existing.identity_key === key) return 'unchanged';
        state.peers.set(id, { identity_key: key, verified: false });
        return 'changed';
    },
    setPeerVerified: (id: string, verified: boolean) => {
        const p = state.peers.get(id);
        if (p) p.verified = verified;
    },
    clearMlsLocalData: () => {
        state.groups.clear();
        state.decrypted.clear();
        for (const k of [...state.settings.keys()]) {
            if (k.endsWith('::u1') || k === 'mls_device_id_1') state.settings.delete(k);
        }
    },
}));
vi.mock('../logger', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('../auth-storage', () => ({ getAuthSession: () => ({ user_id: 1 }) }));

import { net } from 'electron';
import { decryptBundle, encryptBundle } from './backup';
import { loadBackupCode, saveKeystore } from './keystore';
import { mlsService, runExclusive } from './service';

const HOST = 'localhost';
const TOKEN = 'test-token';

interface Call {
    url: string;
    method: string;
    body: unknown;
}
let calls: Call[];

/** Route net.fetch by (method, url-substring) → { status, data }. */
function route(handler: (method: string, url: string, body: unknown) => { status: number; data?: unknown }): void {
    (net.fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        async (url: string, opts: { method?: string; body?: string }) => {
            const method = opts?.method ?? 'GET';
            const body = opts?.body ? JSON.parse(opts.body) : undefined;
            calls.push({ url, method, body });
            const { status, data } = handler(method, url, body);
            return { status, json: async () => ({ data }) };
        },
    );
}

beforeEach(() => {
    state.settings.clear();
    state.groups.clear();
    state.decrypted.clear();
    state.peers.clear();
    calls = [];
    for (const f of ['mls-1.bin', 'mls-backup-1.bin']) {
        const p = join(tmpdir(), f);
        if (existsSync(p)) unlinkSync(p);
    }
    (net.fetch as unknown as ReturnType<typeof vi.fn>).mockReset?.();
});

describe('mlsService', () => {
    it('reports not-established with a stable device id before setup', () => {
        const s = mlsService.status();
        expect(s.established).toBe(false);
        expect(s.deviceId).toMatch(/^[0-9a-f-]{36}$/);
        expect(mlsService.status().deviceId).toBe(s.deviceId);
    });

    it('ensureSetup registers identity + device + key packages and is idempotent', async () => {
        route((_m, url) => {
            if (url.includes('/identity/register')) return { status: 201 };
            if (url.includes('/devices/register')) return { status: 201 };
            if (url.includes('/mls/key-packages')) return { status: 201 };
            return { status: 200 };
        });

        const { deviceId } = await mlsService.ensureSetup(HOST, TOKEN);
        expect(deviceId).toMatch(/^[0-9a-f-]{36}$/);
        expect(mlsService.status().established).toBe(true);
        expect(calls.some((c) => c.url.includes('/identity/register'))).toBe(true);
        expect(calls.some((c) => c.url.includes('/devices/register'))).toBe(true);
        const kpCall = calls.find((c) => c.url.includes('/mls/key-packages') && c.method === 'POST');
        expect((kpCall!.body as { key_packages: unknown[] }).key_packages.length).toBeGreaterThan(0);

        // Second call re-registers nothing (keystore already present); it only
        // probes backup state until the recovery code is acknowledged.
        await mlsService.ensureSetup(HOST, TOKEN);
        expect(calls.filter((c) => c.url.includes('/identity/register')).length).toBe(1);
        expect(calls.filter((c) => c.url.includes('/devices/register')).length).toBe(1);
    });

    it('flags backupNeeded until the recovery code is acknowledged', async () => {
        route((_m, url) => {
            if (url.includes('/keys/backup/exists')) return { status: 200, data: { exists: false } };
            return { status: 201 };
        });

        let res = await mlsService.ensureSetup(HOST, TOKEN);
        expect(res.backupNeeded).toBe(true);

        // Auto-created backup re-shows the SAME code until confirmed (force-quit safety).
        const code = await mlsService.backupPrompt(HOST, TOKEN);
        expect(await mlsService.backupPrompt(HOST, TOKEN)).toBe(code);
        res = await mlsService.ensureSetup(HOST, TOKEN);
        expect(res.backupNeeded).toBe(true);

        mlsService.backupConfirmed();
        res = await mlsService.ensureSetup(HOST, TOKEN);
        expect(res.backupNeeded).toBe(false);
    });

    it('skips the backup prompt when another device owns the backup', async () => {
        route((_m, url) => {
            if (url.includes('/keys/backup/exists')) return { status: 200, data: { exists: true } };
            return { status: 201 };
        });

        const res = await mlsService.ensureSetup(HOST, TOKEN);
        expect(res.backupNeeded).toBe(false);
    });

    it('ensureSetup signals linkRequired when the account identity already exists', async () => {
        route((_m, url) => {
            if (url.includes('/identity/register')) return { status: 409 }; // set up elsewhere
            return { status: 200 };
        });

        const res = await mlsService.ensureSetup(HOST, TOKEN);
        expect(res.linkRequired).toBe(true);
        // Must not leave a half-provisioned keystore, and must not register a device.
        expect(mlsService.status().established).toBe(false);
        expect(calls.some((c) => c.url.includes('/devices/register'))).toBe(false);
    });

    it('decryptDm returns cached plaintext without decrypting again', async () => {
        state.decrypted.set('42', 'already decrypted');
        route(() => {
            throw new Error('network should not be called on a cache hit');
        });
        expect(mlsService.decryptDm(1, '42', 'aWdub3JlZA==')).toBe('already decrypted');
    });

    it('cacheDm stores plaintext for later history render', () => {
        mlsService.cacheDm(1, '99', 'my own message');
        expect(state.decrypted.get('99')).toBe('my own message');
    });

    it('decryptDm returns null (not throw) on undecryptable ciphertext', async () => {
        route((_m, url) => {
            if (url.includes('/identity/register')) return { status: 201 };
            if (url.includes('/devices/register')) return { status: 201 };
            if (url.includes('/mls/key-packages')) return { status: 201 };
            return { status: 200 };
        });
        await mlsService.ensureSetup(HOST, TOKEN);
        // Garbage ciphertext for a group we don't hold — old code threw (spamming the IPC
        // handler and failing the whole DM fetch); now it yields a placeholder.
        const garbage = Buffer.from('not real ciphertext').toString('base64');
        expect(mlsService.decryptDm(99, 'msg-x', garbage)).toBeNull();
    });

    it('backup uploads an encrypted bundle that decrypts back to keystore + history', async () => {
        saveKeystore(new Uint8Array([1, 2, 3]), new Uint8Array([4, 5]), 'user-priv');
        state.decrypted.set('m1', 'hello history');

        let posted: unknown;
        route((method, url, body) => {
            if (url.includes('/keys/backup') && method === 'POST') {
                posted = body;
                return { status: 201 };
            }
            return { status: 200 };
        });

        const code = mlsService.newRecoveryCode();
        await mlsService.backup(HOST, TOKEN, code);

        const bundle = JSON.parse(decryptBundle(code, posted as never)) as {
            userIdentityPriv: string;
            history: Array<{ content: string }>;
        };
        expect(bundle.userIdentityPriv).toBe('user-priv');
        expect(bundle.history.map((h) => h.content)).toContain('hello history');
        // Recovery code is stored so the backup can be refreshed automatically.
        expect(loadBackupCode()).toBe(code);
    });

    it('marks the backup dirty when a message is cached (for auto-backup)', () => {
        mlsService.cacheDm(1, 'm7', 'new plaintext');
        expect(state.settings.get('mls_backup_dirty::u1')).toBe('1');
    });

    it('backup falls back to PUT when a backup already exists (409)', async () => {
        saveKeystore(new Uint8Array([1]), new Uint8Array([2]), 'user-priv');
        route((method, url) => {
            if (url.includes('/keys/backup') && method === 'POST') return { status: 409 };
            if (url.includes('/keys/backup') && method === 'PUT') return { status: 200 };
            return { status: 200 };
        });
        await mlsService.backup(HOST, TOKEN, mlsService.newRecoveryCode());
        expect(calls.some((c) => c.method === 'PUT' && c.url.includes('/keys/backup'))).toBe(true);
    });

    it('restore links the device with the shared identity + history', async () => {
        // A real Ed25519 identity key (restore derives its public half).
        const { privateKey } = generateKeyPairSync('ed25519');
        const sharedPriv = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
        const code = mlsService.newRecoveryCode();
        const encrypted = encryptBundle(
            code,
            JSON.stringify({
                userIdentityPriv: sharedPriv,
                history: [{ message_id: 'h1', group_id: 'dm:1', content: 'restored msg' }],
            }),
        );
        route((method, url) => {
            if (url.includes('/keys/backup') && method === 'GET') return { status: 200, data: encrypted };
            return { status: 200 }; // devices/register + key-packages
        });

        await mlsService.restore(HOST, TOKEN, code);
        expect(state.decrypted.get('h1')).toBe('restored msg');
        expect(mlsService.status().established).toBe(true);
        // The device provisioned itself and published signed key packages.
        expect(calls.some((c) => c.method === 'POST' && c.url.includes('/mls/key-packages'))).toBe(true);
    });

    it('verificationStatus pins a peer (TOFU) and returns a safety number; markVerified flips it', async () => {
        state.settings.set('mls_identity_pub::u1', 'MY-IDENTITY-KEY');
        route((method, url) => {
            if (url.includes('/identity/7') && method === 'GET')
                return { status: 200, data: { identity_key: 'PEER-KEY' } };
            return { status: 200 };
        });

        const first = await mlsService.verificationStatus(HOST, TOKEN, 7);
        expect(first.pinned).toBe(true);
        expect(first.verified).toBe(false);
        expect(first.changed).toBe(false);
        expect(first.safetyNumber).toMatch(/^(\d{5} ){11}\d{5}$/);

        mlsService.markVerified(7);
        const after = await mlsService.verificationStatus(HOST, TOKEN, 7);
        expect(after.verified).toBe(true);
        expect(after.changed).toBe(false); // same key → not a change
    });

    it('verificationStatus flags a changed peer identity key stickily until re-verified', async () => {
        state.settings.set('mls_identity_pub::u1', 'MY-IDENTITY-KEY');
        let key = 'ORIGINAL';
        route((method, url) => {
            if (url.includes('/identity/8') && method === 'GET') return { status: 200, data: { identity_key: key } };
            return { status: 200 };
        });

        await mlsService.verificationStatus(HOST, TOKEN, 8); // pins ORIGINAL
        key = 'ROTATED-BY-ATTACKER';
        const changed = await mlsService.verificationStatus(HOST, TOKEN, 8);
        expect(changed.changed).toBe(true);
        expect(changed.verified).toBe(false); // re-pin resets verification

        // Sticky: a later fetch with the SAME (rotated) key still reports changed.
        const stillChanged = await mlsService.verificationStatus(HOST, TOKEN, 8);
        expect(stillChanged.changed).toBe(true);

        // Re-verifying clears the sticky warning.
        mlsService.markVerified(8);
        const cleared = await mlsService.verificationStatus(HOST, TOKEN, 8);
        expect(cleared.changed).toBe(false);
    });

    it('runExclusive serializes overlapping operations', async () => {
        const order: string[] = [];
        const a = runExclusive(async () => {
            order.push('a-start');
            await new Promise((r) => setTimeout(r, 5));
            order.push('a-end');
        });
        const b = runExclusive(() => {
            order.push('b');
        });
        await Promise.all([a, b]);
        expect(order).toEqual(['a-start', 'a-end', 'b']);
    });

    it('toggles the require-verification setting', async () => {
        expect(mlsService.getRequireVerification()).toBe(false);
        mlsService.setRequireVerification(true);
        expect(mlsService.getRequireVerification()).toBe(true);
        mlsService.setRequireVerification(false);
        expect(mlsService.getRequireVerification()).toBe(false);
    });

    it('reports local verification state without a network call', () => {
        route(() => {
            throw new Error('localVerification must not hit the network');
        });
        expect(mlsService.localVerification(5)).toEqual({ pinned: false, verified: false });
        state.peers.set('5', { identity_key: 'K', verified: true });
        expect(mlsService.localVerification(5)).toEqual({ pinned: true, verified: true });
    });

    it('reconcileAllDmGroups is a no-op with no keystore', async () => {
        state.groups.set('dm:1', { group_id: 'dm:1', epoch: 1, last_message_id: 0, updated_at: 'now' });
        route(() => {
            throw new Error('should not reconcile without a keystore');
        });
        await mlsService.reconcileAllDmGroups(HOST, TOKEN);
        expect(calls.length).toBe(0);
    });

    it('re-establishes a DM group when metadata is stale but the keystore lost it (self-heal)', async () => {
        route((_m, url) => {
            if (url.includes('/identity/register')) return { status: 201 };
            if (url.includes('/devices/register')) return { status: 201 };
            if (url.includes('/mls/key-packages')) return { status: 201 };
            return { status: 200 };
        });
        await mlsService.ensureSetup(HOST, TOKEN);

        // Drift: a metadata row claims dm:9 exists, but the keystore has no such group.
        state.groups.set('dm:9', { group_id: 'dm:9', epoch: 0, last_message_id: 0, updated_at: 'now' });
        route((_m, url) => {
            if (url.includes('/mls/groups/dm:9/claim')) return { status: 200 };
            if (url.includes('/dm-groups/9/members/bundles')) return { status: 200, data: [] };
            if (url.includes('/join-requests')) return { status: 200, data: [] };
            return { status: 200 };
        });

        // Old code skipped re-establish (metadata present) and threw "group not found
        // in storage" on memberIdentities; the fix re-creates the group instead.
        await expect(mlsService.establishDmGroup(HOST, TOKEN, 9)).resolves.toBeUndefined();
        // The group now really exists in the keystore, so we can encrypt into it.
        expect(() => mlsService.encryptDm(9, 'hello')).not.toThrow();
    });

    it('registers the device with its platform and a descriptive name', async () => {
        route((_m, url) => {
            if (url.includes('/identity/register')) return { status: 201 };
            if (url.includes('/devices/register')) return { status: 201 };
            if (url.includes('/mls/key-packages')) return { status: 201 };
            return { status: 200 };
        });
        await mlsService.ensureSetup(HOST, TOKEN);

        const reg = calls.find((c) => c.url.includes('/devices/register'));
        const body = reg!.body as { device_name: string; platform: string };
        expect(body.platform).toBe(process.platform);
        expect(body.device_name).toContain(process.platform);
    });

    it('ensureSetup binds the token to this device', async () => {
        route((_m, url) => {
            if (url.includes('/identity/register')) return { status: 201 };
            if (url.includes('/devices/register')) return { status: 201 };
            if (url.includes('/mls/key-packages')) return { status: 201 };
            return { status: 200 };
        });
        const { deviceId } = await mlsService.ensureSetup(HOST, TOKEN);
        // bindDevice is fire-and-forget; let the microtask queue drain.
        await new Promise((r) => setImmediate(r));

        const bind = calls.find((c) => c.url.includes('/devices/bind'));
        expect((bind!.body as { device_id: string }).device_id).toBe(deviceId);
    });

    it('wipeLocal destroys local key material without any network calls', async () => {
        route((_m, url) => {
            if (url.includes('/identity/register')) return { status: 201 };
            if (url.includes('/devices/register')) return { status: 201 };
            if (url.includes('/mls/key-packages')) return { status: 201 };
            return { status: 200 };
        });
        await mlsService.ensureSetup(HOST, TOKEN);
        await new Promise((r) => setImmediate(r));
        expect(mlsService.status().established).toBe(true);

        calls = [];
        mlsService.wipeLocal();

        expect(mlsService.status().established).toBe(false);
        expect(loadBackupCode()).toBeNull();
        expect(calls.length).toBe(0);
    });

    it('self-heals when irrecoverably behind: drops the group and requests a rejoin', async () => {
        route((_m, url) => {
            if (url.includes('/identity/register')) return { status: 201 };
            if (url.includes('/devices/register')) return { status: 201 };
            if (url.includes('/mls/key-packages')) return { status: 201 };
            if (url.includes('/join-requests')) return { status: 200, data: [] };
            if (url.includes('/dm-groups/1/members/bundles')) return { status: 200, data: [] };
            return { status: 200 };
        });
        await mlsService.ensureSetup(HOST, TOKEN);
        await mlsService.establishDmGroup(HOST, TOKEN, 1); // solo group at epoch 0

        // A commit from far beyond our epoch: we can never replay our way there.
        route((_m, url) => {
            if (url.includes('/mls/groups/dm:1/messages') && !url.includes('welcome'))
                return {
                    status: 200,
                    data: [
                        {
                            id: 7,
                            message_type: 'commit',
                            message_bytes: 'anVuaw==',
                            sender_user_id: 2,
                            sender_device_id: 'peer-device',
                            epoch: 99,
                        },
                    ],
                };
            if (url.includes('/join-request')) return { status: 201 };
            if (url.includes('/mls/key-packages')) return { status: 201 };
            if (url.includes('/mls/welcome')) return { status: 200, data: [] };
            if (url.includes('/dm-groups/1/members/bundles')) return { status: 200, data: [] };
            return { status: 200 };
        });
        await mlsService.syncDmGroup(HOST, TOKEN, 1);

        // It asked to be re-added, republished key packages, and dropped the group.
        expect(calls.some((c) => c.method === 'POST' && c.url.includes('/mls/groups/dm:1/join-request'))).toBe(true);
        expect(calls.some((c) => c.method === 'POST' && c.url.includes('/mls/key-packages'))).toBe(true);
        expect(() => mlsService.encryptDm(1, 'x')).toThrow(); // group is gone locally

        // Throttled: an immediate second wedge does not re-request.
        calls = [];
        await mlsService.syncDmGroup(HOST, TOKEN, 1);
        expect(calls.some((c) => c.method === 'POST' && c.url.includes('/join-request'))).toBe(false);
    });

    it('heals a wedged peer: evicts the stale leaf, re-welcomes it, and fulfills the request', async () => {
        const { generateKeyPairSync: genKeys } = await import('node:crypto');
        const { signKeyPackage: sign } = await import('./identity');
        const { MlsEngine: Engine } = await import('./engine');
        const { createHash } = await import('node:crypto');

        // Peer user 2 with a signed identity + device engine.
        const { publicKey, privateKey } = genKeys('ed25519');
        const peerIdentityPub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
        const peerIdentityPriv = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

        const setupRoutes = (kpBytes: Uint8Array | null, pendingJoins: unknown[]): void =>
            route((_m, url) => {
                if (url.includes('/identity/register')) return { status: 201 };
                if (url.includes('/devices/register')) return { status: 201 };
                if (url.includes('/mls/key-packages/2')) {
                    if (!kpBytes) return { status: 200, data: [] };
                    const b64kp = Buffer.from(kpBytes).toString('base64');
                    return {
                        status: 200,
                        data: [
                            {
                                device_id: 'peer-device-1',
                                key_package_bytes: b64kp,
                                identity_signature: sign(peerIdentityPriv, kpBytes),
                            },
                        ],
                    };
                }
                if (url.includes('/mls/key-packages')) return { status: 201 };
                if (url.includes('/identity/2')) return { status: 200, data: { identity_key: peerIdentityPub } };
                if (url.includes('/join-requests')) return { status: 200, data: pendingJoins };
                if (url.includes('/dm-groups/3/members/bundles'))
                    return { status: 200, data: [{ user_id: 2, devices: [{ device_id: 'peer-device-1' }] }] };
                if (url.includes('/mls/welcome')) return { status: 200, data: [] };
                return { status: 200 };
            });

        await (async () => {
            route((_m, url) => {
                if (url.includes('/identity/register')) return { status: 201 };
                if (url.includes('/devices/register')) return { status: 201 };
                if (url.includes('/mls/key-packages')) return { status: 201 };
                return { status: 200 };
            });
            await mlsService.ensureSetup(HOST, TOKEN);
        })();

        const peerEngine = Engine.create('peer-device-1');
        const [peerKp1, peerKp2] = peerEngine.generateKeyPackages(2);
        void createHash; // hash used indirectly via service key package payloads

        // First establish: adds the peer normally (welcome #1).
        setupRoutes(peerKp1, []);
        await mlsService.establishDmGroup(HOST, TOKEN, 3);
        expect(calls.filter((c) => c.method === 'POST' && c.url.includes('/welcome')).length).toBe(1);

        // Peer wedges and requests a rejoin; re-establish should heal it.
        calls = [];
        setupRoutes(peerKp2, [{ user_id: 2, device_id: 'peer-device-1' }]);
        await mlsService.establishDmGroup(HOST, TOKEN, 3);

        const commits = calls.filter((c) => c.method === 'POST' && c.url.includes('/mls/groups/dm:3/messages'));
        expect(commits.length).toBeGreaterThanOrEqual(2); // eviction commit + re-add commit
        expect(calls.filter((c) => c.method === 'POST' && c.url.includes('/welcome')).length).toBe(1); // fresh welcome
        expect(calls.some((c) => c.method === 'POST' && c.url.includes('/join-request/fulfill'))).toBe(true);
    });

    it('restore throws on a wrong recovery code', async () => {
        const encrypted = encryptBundle(
            mlsService.newRecoveryCode(),
            JSON.stringify({ provider: '', identity: '', history: [] }),
        );
        route(() => ({ status: 200, data: encrypted }));
        await expect(mlsService.restore(HOST, TOKEN, mlsService.newRecoveryCode())).rejects.toThrow();
    });
});
