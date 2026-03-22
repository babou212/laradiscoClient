/* tslint:disable */

export class AddMessages {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly commit: Uint8Array;
    readonly proposal: Uint8Array;
    readonly welcome: Uint8Array;
}

export class Group {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Discard a pending commit that was not accepted by the delivery service.
     * This rolls back the group state so it can continue operating normally.
     */
    clear_pending_commit(provider: Provider): void;
    create_message(provider: Provider, sender: Identity, msg: Uint8Array): Uint8Array;
    static create_new(provider: Provider, founder: Identity, group_id: string): Group;
    /**
     * Get the current epoch number.
     */
    epoch(): bigint;
    export_key(provider: Provider, label: string, context: Uint8Array, key_length: number): Uint8Array;
    export_ratchet_tree(): RatchetTree;
    /**
     * Get the group ID as bytes.
     */
    group_id(): Uint8Array;
    /**
     * Check if the group is still active (not evicted).
     */
    is_active(): boolean;
    static join(provider: Provider, welcome: Uint8Array, ratchet_tree: RatchetTree): Group;
    /**
     * Load a group from the provider's storage by group ID string.
     */
    static load(provider: Provider, group_id: string): Group;
    /**
     * Get all current group members.
     */
    members(): MemberInfo[];
    merge_pending_commit(provider: Provider): void;
    /**
     * Get own leaf index in the group tree.
     */
    own_leaf_index(): number;
    process_message(provider: Provider, msg: Uint8Array): ProcessedMessage;
    propose_and_commit_add(provider: Provider, sender: Identity, new_member: KeyPackage): AddMessages;
    /**
     * Remove members by their leaf indices.
     */
    remove_members(provider: Provider, sender: Identity, leaf_indices: Uint32Array): RemoveMessages;
    /**
     * Perform a self-update (key rotation).
     */
    self_update(provider: Provider, sender: Identity): UpdateMessages;
}

export class Identity {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Restore an identity from bytes and register the keypair in the provider's storage.
     */
    static from_bytes(provider: Provider, bytes: Uint8Array): Identity;
    key_package(provider: Provider): KeyPackage;
    constructor(provider: Provider, name: string);
    /**
     * Serialize identity (keypair + credential name) to JSON bytes for backup/restore.
     */
    to_bytes(): Uint8Array;
}

export class KeyPackage {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    static from_bytes(bytes: Uint8Array): KeyPackage;
    to_bytes(): Uint8Array;
}

export class MemberInfo {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly encryption_key: Uint8Array;
    readonly identity: Uint8Array;
    readonly index: number;
    readonly signature_key: Uint8Array;
}

export class NoWelcomeError {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
}

export class ProcessedMessage {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly msg_type: string;
    readonly payload: Uint8Array | undefined;
}

export class Provider {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Restore a provider from serialized storage bytes.
     */
    static from_bytes(bytes: Uint8Array): Provider;
    constructor();
    /**
     * Serialize the provider's storage to bytes for persistence.
     * This captures all group state, key material, and epoch secrets.
     */
    to_bytes(): Uint8Array;
}

export class RatchetTree {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    static from_bytes(bytes: Uint8Array): RatchetTree;
    to_bytes(): Uint8Array;
}

export class RemoveMessages {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly commit: Uint8Array;
}

export class UpdateMessages {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly commit: Uint8Array;
    readonly welcome: Uint8Array | undefined;
}

export function greet(): void;
