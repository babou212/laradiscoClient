import { readFileSync } from 'fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { MlsEngine } from './engine';
import { initMls } from './runtime';

const enc = new TextEncoder();
const dec = new TextDecoder();

beforeAll(() => {
    initMls(readFileSync(new URL('./wasm/openmls_wasm_bg.wasm', import.meta.url)));
});

describe('MlsEngine', () => {
    it('runs the full 1:1 DM flow: create → add → join → encrypt → decrypt', () => {
        const alice = MlsEngine.create('alice-device-1');
        const bob = MlsEngine.create('bob-device-1');

        const [bobKp] = bob.generateKeyPackages(1);

        alice.createGroup('dm:1');
        const add = alice.addMember('dm:1', bobKp);
        alice.mergePending('dm:1');

        const joinedId = bob.joinFromWelcome(add.welcome, add.ratchetTree);
        expect(joinedId).toBe('dm:1');

        const { ciphertext } = alice.encrypt('dm:1', enc.encode('hello bob'));
        const result = bob.processIncoming('dm:1', ciphertext, () => true);

        expect(result.type).toBe('application');
        if (result.type === 'application') {
            expect(dec.decode(result.plaintext)).toBe('hello bob');
        }
    });

    it('restores a device from its persisted keystore blob and keeps decrypting', () => {
        const alice = MlsEngine.create('alice-device-1');
        const bob = MlsEngine.create('bob-device-1');
        const [bobKp] = bob.generateKeyPackages(1);
        alice.createGroup('dm:2');
        const add = alice.addMember('dm:2', bobKp);
        alice.mergePending('dm:2');
        bob.joinFromWelcome(add.welcome, add.ratchetTree);

        // Simulate an app restart: serialize + restore Alice's whole keystore.
        const restoredAlice = MlsEngine.restore(alice.serialize(), alice.serializeIdentity());

        const { ciphertext } = restoredAlice.encrypt('dm:2', enc.encode('after restart'));
        const result = bob.processIncoming('dm:2', ciphertext, () => true);
        expect(result.type).toBe('application');
        if (result.type === 'application') {
            expect(dec.decode(result.plaintext)).toBe('after restart');
        }
    });

    it('applies an inbound commit only when the policy allows it', () => {
        const alice = MlsEngine.create('alice-device-1');
        const bob = MlsEngine.create('bob-device-1');
        const carol = MlsEngine.create('carol-device-1');

        const [bobKp] = bob.generateKeyPackages(1);
        alice.createGroup('dm:3');
        const addBob = alice.addMember('dm:3', bobKp);
        alice.mergePending('dm:3');
        bob.joinFromWelcome(addBob.welcome, addBob.ratchetTree);

        // Alice adds Carol → produces a commit that existing member Bob must process.
        const [carolKp] = carol.generateKeyPackages(1);
        const addCarol = alice.addMember('dm:3', carolKp);
        alice.mergePending('dm:3');

        // Policy rejects: the added identity is not an allowed participant.
        const rejected = bob.processIncoming('dm:3', addCarol.commit, ({ addedIdentities }) =>
            addedIdentities.every((id) => id === 'someone-else'),
        );
        expect(rejected.type).toBe('commit');
        if (rejected.type === 'commit') {
            expect(rejected.applied).toBe(false);
            expect(rejected.staged.added_identities).toEqual(['carol-device-1']);
        }

        expect(bob.memberIdentities('dm:3').sort()).toEqual(['alice-device-1', 'bob-device-1']);
    });

    it('accepts a commit whose added identity is an allowed participant', () => {
        const alice = MlsEngine.create('alice-device-1');
        const bob = MlsEngine.create('bob-device-1');
        const carol = MlsEngine.create('carol-device-1');
        const [bobKp] = bob.generateKeyPackages(1);
        alice.createGroup('dm:4');
        const addBob = alice.addMember('dm:4', bobKp);
        alice.mergePending('dm:4');
        bob.joinFromWelcome(addBob.welcome, addBob.ratchetTree);

        const [carolKp] = carol.generateKeyPackages(1);
        const addCarol = alice.addMember('dm:4', carolKp);
        alice.mergePending('dm:4');

        const accepted = bob.processIncoming('dm:4', addCarol.commit, ({ addedIdentities }) =>
            addedIdentities.every((id) => id === 'carol-device-1'),
        );
        expect(accepted.type).toBe('commit');
        if (accepted.type === 'commit') {
            expect(accepted.applied).toBe(true);
        }
    });

    it('lists current member identities by device id', () => {
        const alice = MlsEngine.create('alice-device-1');
        const bob = MlsEngine.create('bob-device-1');
        const [bobKp] = bob.generateKeyPackages(1);
        alice.createGroup('dm:5');
        expect(alice.memberIdentities('dm:5')).toEqual(['alice-device-1']);

        alice.addMember('dm:5', bobKp);
        alice.mergePending('dm:5');
        expect(alice.memberIdentities('dm:5').sort()).toEqual(['alice-device-1', 'bob-device-1']);
    });

    it('delivers multiple messages in order without state corruption', () => {
        const alice = MlsEngine.create('alice-device-1');
        const bob = MlsEngine.create('bob-device-1');
        const [bobKp] = bob.generateKeyPackages(1);
        alice.createGroup('dm:6');
        const add = alice.addMember('dm:6', bobKp);
        alice.mergePending('dm:6');
        bob.joinFromWelcome(add.welcome, add.ratchetTree);

        for (const text of ['one', 'two', 'three']) {
            const { ciphertext } = alice.encrypt('dm:6', enc.encode(text));
            const r = bob.processIncoming('dm:6', ciphertext, () => true);
            expect(r.type === 'application' && dec.decode(r.plaintext)).toBe(text);
        }
    });

    it('generates the requested number of distinct key packages', () => {
        const alice = MlsEngine.create('alice-device-1');
        const kps = alice.generateKeyPackages(3);
        expect(kps).toHaveLength(3);
        const seen = new Set(kps.map((k) => Buffer.from(k).toString('base64')));
        expect(seen.size).toBe(3);
    });

    it('reports an active member as active and supports bidirectional messaging', () => {
        const alice = MlsEngine.create('alice-device-1');
        const bob = MlsEngine.create('bob-device-1');
        const [bobKp] = bob.generateKeyPackages(1);
        alice.createGroup('dm:7');
        const add = alice.addMember('dm:7', bobKp);
        alice.mergePending('dm:7');
        bob.joinFromWelcome(add.welcome, add.ratchetTree);

        expect(alice.isActive('dm:7')).toBe(true);
        expect(bob.isActive('dm:7')).toBe(true);

        // Bob → Alice as well.
        const { ciphertext } = bob.encrypt('dm:7', enc.encode('reply'));
        const r = alice.processIncoming('dm:7', ciphertext, () => true);
        expect(r.type === 'application' && dec.decode(r.plaintext)).toBe('reply');
    });

    it('preserves group membership across a keystore restore', () => {
        const alice = MlsEngine.create('alice-device-1');
        const bob = MlsEngine.create('bob-device-1');
        const [bobKp] = bob.generateKeyPackages(1);
        alice.createGroup('dm:8');
        alice.addMember('dm:8', bobKp);
        alice.mergePending('dm:8');

        const restored = MlsEngine.restore(alice.serialize(), alice.serializeIdentity());
        expect(restored.memberIdentities('dm:8').sort()).toEqual(['alice-device-1', 'bob-device-1']);
        expect(restored.isActive('dm:8')).toBe(true);
    });

    it('removes a member (revocation) and drops them from the roster', () => {
        const alice = MlsEngine.create('alice-device-1');
        const bob = MlsEngine.create('bob-device-1');
        const [bobKp] = bob.generateKeyPackages(1);
        alice.createGroup('dm:9');
        const add = alice.addMember('dm:9', bobKp);
        alice.mergePending('dm:9');
        bob.joinFromWelcome(add.welcome, add.ratchetTree);
        expect(alice.memberIdentities('dm:9').sort()).toEqual(['alice-device-1', 'bob-device-1']);

        const removal = alice.removeMembers('dm:9', ['bob-device-1']);
        alice.mergePending('dm:9');
        expect(removal).not.toBeNull();
        expect(alice.memberIdentities('dm:9')).toEqual(['alice-device-1']);

        // Bob processes the removal and is no longer active in the group.
        bob.processIncoming('dm:9', removal!.commit, () => true);
        expect(bob.isActive('dm:9')).toBe(false);
    });

    it('clearPending discards a rejected commit without advancing state', () => {
        const alice = MlsEngine.create('alice-device-1');
        const bob = MlsEngine.create('bob-device-1');
        const [bobKp, bobKp2] = bob.generateKeyPackages(2);
        alice.createGroup('dm:12');
        const epochBefore = alice.epoch('dm:12');

        // Server rejects the commit (epoch conflict) → discard, no fork.
        alice.addMember('dm:12', bobKp);
        alice.clearPending('dm:12');
        expect(alice.epoch('dm:12')).toBe(epochBefore);
        expect(alice.memberIdentities('dm:12')).toEqual(['alice-device-1']);

        // A retry commit can still be created and merged afterwards.
        alice.addMember('dm:12', bobKp2);
        alice.mergePending('dm:12');
        expect(alice.epoch('dm:12')).toBe(epochBefore + 1);
        expect(alice.memberIdentities('dm:12').sort()).toEqual(['alice-device-1', 'bob-device-1']);
    });

    it('deleteGroup drops local state so a fresh welcome can rejoin at the current epoch', () => {
        const alice = MlsEngine.create('alice-device-1');
        const bob = MlsEngine.create('bob-device-1');
        const [bobKp, bobKp2] = bob.generateKeyPackages(2);
        alice.createGroup('dm:13');
        const add = alice.addMember('dm:13', bobKp);
        alice.mergePending('dm:13');
        bob.joinFromWelcome(add.welcome, add.ratchetTree);

        // Bob fell irrecoverably behind → self-heal: wipe local group state.
        bob.deleteGroup('dm:13');
        expect(bob.hasGroup('dm:13')).toBe(false);

        // A member evicts bob's stale leaf and re-adds him with a fresh KeyPackage.
        alice.removeMembers('dm:13', ['bob-device-1']);
        alice.mergePending('dm:13');
        const readd = alice.addMember('dm:13', bobKp2);
        alice.mergePending('dm:13');
        bob.joinFromWelcome(readd.welcome, readd.ratchetTree);

        expect(bob.epoch('dm:13')).toBe(alice.epoch('dm:13'));
        const { ciphertext } = alice.encrypt('dm:13', enc.encode('healed'));
        const r = bob.processIncoming('dm:13', ciphertext, () => true);
        expect(r.type === 'application' && dec.decode(r.plaintext)).toBe('healed');
    });

    it('removeMembers returns null when no identity matches', () => {
        const alice = MlsEngine.create('alice-device-1');
        alice.createGroup('dm:10');
        expect(alice.removeMembers('dm:10', ['ghost'])).toBeNull();
    });

    it('self-update rotates the leaf key and members can still message', () => {
        const alice = MlsEngine.create('alice-device-1');
        const bob = MlsEngine.create('bob-device-1');
        const [bobKp] = bob.generateKeyPackages(1);
        alice.createGroup('dm:11');
        const add = alice.addMember('dm:11', bobKp);
        alice.mergePending('dm:11');
        bob.joinFromWelcome(add.welcome, add.ratchetTree);

        const update = alice.selfUpdate('dm:11');
        alice.mergePending('dm:11');
        bob.processIncoming('dm:11', update.commit, () => true);

        const { ciphertext } = alice.encrypt('dm:11', enc.encode('after rekey'));
        const r = bob.processIncoming('dm:11', ciphertext, () => true);
        expect(r.type === 'application' && dec.decode(r.plaintext)).toBe('after rekey');
    });
});
