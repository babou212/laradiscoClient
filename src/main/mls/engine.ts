import { Group, Identity, KeyPackage, Provider, RatchetTree } from './runtime';
import type {
    Group as GroupT,
    Identity as IdentityT,
    Provider as ProviderT,
} from './runtime';

export interface StagedCommit {
    added_identities: string[];
    removed_indices: number[];
    updated_identities: string[];
}

export type ProcessResult =
    | { type: 'application'; plaintext: Uint8Array }
    | { type: 'proposal' }
    | { type: 'commit'; applied: boolean; staged: StagedCommit };

export interface AddResult {
    commit: Uint8Array;
    welcome: Uint8Array;
    ratchetTree: Uint8Array;
}

/**
 * Decide whether an inbound commit is allowed to merge. Receives the decoded
 * identity strings being added and the leaf indices being removed. For 1:1 DMs
 * the service passes a predicate that only accepts identities belonging to the
 * two conversation participants (verified out-of-band via the backend).
 */
export type CommitPolicy = (info: {
    addedIdentities: string[];
    removedIndices: number[];
}) => boolean;

const td = new TextDecoder();

export class MlsEngine {
    private constructor(
        private readonly provider: ProviderT,
        private readonly identity: IdentityT,
    ) {}

    /** Create a brand-new device identity (credential + Ed25519 keypair). */
    static create(deviceName: string): MlsEngine {
        const provider = new Provider();
        const identity = new Identity(provider, deviceName);
        return new MlsEngine(provider, identity);
    }

    /** Restore a device from persisted keystore + identity blobs. */
    static restore(providerBlob: Uint8Array, identityBlob: Uint8Array): MlsEngine {
        const provider = Provider.from_bytes(providerBlob);
        const identity = Identity.from_bytes(provider, identityBlob);
        return new MlsEngine(provider, identity);
    }

    /** Whole-keystore blob for at-rest persistence / backup. */
    serialize(): Uint8Array {
        return this.provider.to_bytes();
    }

    /** Identity handle blob (restored against a deserialized provider). */
    serializeIdentity(): Uint8Array {
        return this.identity.to_bytes();
    }

    /**
     * Generate `count` fresh KeyPackages to publish to the delivery service.
     * The private halves stay in the keystore; only the returned bytes are
     * uploaded. Each is consumed once when someone adds this device.
     */
    generateKeyPackages(count: number): Uint8Array[] {
        const out: Uint8Array[] = [];
        for (let i = 0; i < count; i++) {
            out.push(this.identity.key_package(this.provider).to_bytes());
        }
        return out;
    }

    /** Found a new group (this device is the sole initial member). */
    createGroup(groupId: string): void {
        Group.create_new(this.provider, this.identity, groupId);
    }

    /** Whether this group actually exists in this device's keystore. */
    hasGroup(groupId: string): boolean {
        try {
            Group.load(this.provider, groupId);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Add a member (by their published KeyPackage bytes) to a group we're in.
     * Returns the commit to fan out to existing members and the welcome for the
     * new member; the ratchet tree is exported so the joiner can join even
     * without the tree extension. Advances our own state immediately.
     */
    addMember(groupId: string, keyPackageBytes: Uint8Array): AddResult {
        const group = Group.load(this.provider, groupId);
        const messages = group.add_member(
            this.provider,
            this.identity,
            KeyPackage.from_bytes(keyPackageBytes),
        );
        const ratchetTree = group.export_ratchet_tree().to_bytes();
        group.merge_pending_commit(this.provider);
        return { commit: messages.commit, welcome: messages.welcome, ratchetTree };
    }

    /** Join a group from a Welcome + exported ratchet tree. Returns the group id. */
    joinFromWelcome(welcomeBytes: Uint8Array, ratchetTreeBytes: Uint8Array): string {
        const group = Group.join(
            this.provider,
            welcomeBytes,
            RatchetTree.from_bytes(ratchetTreeBytes),
        );
        return td.decode(group.group_id());
    }

    /** Encrypt an application message. Returns ciphertext + the group epoch. */
    encrypt(groupId: string, plaintext: Uint8Array): { ciphertext: Uint8Array; epoch: number } {
        const group = Group.load(this.provider, groupId);
        const ciphertext = group.create_message(this.provider, this.identity, plaintext);
        return { ciphertext, epoch: Number(group.epoch()) };
    }

    /**
     * Process an inbound MLS message. Application messages return plaintext.
     * Commits are validated against `policy` before merging (MLS itself does not
     * enforce group-membership policy) — accepted commits merge, rejected ones
     * are discarded.
     */
    processIncoming(groupId: string, messageBytes: Uint8Array, policy: CommitPolicy): ProcessResult {
        const group: GroupT = Group.load(this.provider, groupId);
        const processed = group.process_message(this.provider, messageBytes);

        if (processed.msg_type === 'application') {
            return { type: 'application', plaintext: processed.payload ?? new Uint8Array() };
        }
        if (processed.msg_type === 'proposal') {
            return { type: 'proposal' };
        }

        // commit
        const staged = JSON.parse(processed.staged_commit_json ?? '{}') as StagedCommit;
        const allowed = policy({
            addedIdentities: staged.added_identities ?? [],
            removedIndices: staged.removed_indices ?? [],
        });

        if (allowed) {
            group.approve_staged_commit(this.provider);
        } else {
            group.discard_staged_commit();
        }
        return { type: 'commit', applied: allowed, staged };
    }

    /** Whether this device is still an active member of the group. */
    isActive(groupId: string): boolean {
        return Group.load(this.provider, groupId).is_active();
    }

    /** Credential identities (device ids) of the group's current members. */
    memberIdentities(groupId: string): string[] {
        return Group.load(this.provider, groupId)
            .members()
            .map((m) => td.decode(m.identity));
    }

    /** Members with their leaf indices, for mapping removal commits to identities. */
    memberInfo(groupId: string): Array<{ index: number; identity: string }> {
        return Group.load(this.provider, groupId)
            .members()
            .map((m) => ({ index: m.index, identity: td.decode(m.identity) }));
    }

    /**
     * Remove members by their device-id credential (revocation). Returns the
     * commit to fan out, or null if none of the identities are members.
     * Advances our own state immediately.
     */
    removeMembers(groupId: string, deviceIds: string[]): { commit: Uint8Array } | null {
        const group = Group.load(this.provider, groupId);
        const targets = new Set(deviceIds);
        const indices = group
            .members()
            .filter((m) => targets.has(td.decode(m.identity)))
            .map((m) => m.index);
        if (indices.length === 0) return null;

        const messages = group.remove_members(this.provider, this.identity, Uint32Array.from(indices));
        group.merge_pending_commit(this.provider);
        return { commit: messages.commit };
    }

    /**
     * Rotate this device's own leaf key (post-compromise security). Returns the
     * commit to fan out. Advances our own state immediately.
     */
    selfUpdate(groupId: string): { commit: Uint8Array } {
        const group = Group.load(this.provider, groupId);
        const messages = group.self_update(this.provider, this.identity);
        group.merge_pending_commit(this.provider);
        return { commit: messages.commit };
    }
}
