/* tslint:disable */
/* eslint-disable */

export class AddMessages {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly commit: Uint8Array;
    readonly welcome: Uint8Array;
}

export class Group {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    add_member(provider: Provider, sender: Identity, new_member: KeyPackage): AddMessages;
    clear_pending_commit(provider: Provider): void;
    create_message(provider: Provider, sender: Identity, msg: Uint8Array): Uint8Array;
    static create_new(provider: Provider, founder: Identity, group_id: string): Group;
    delete(provider: Provider): void;
    epoch(): bigint;
    export_key(provider: Provider, label: string, context: Uint8Array, key_length: number): Uint8Array;
    export_ratchet_tree(): RatchetTree;
    group_id(): Uint8Array;
    is_active(): boolean;
    static join(provider: Provider, welcome: Uint8Array, ratchet_tree: RatchetTree): Group;
    static load(provider: Provider, group_id: string): Group;
    members(): MemberInfo[];
    merge_pending_commit(provider: Provider): void;
    own_leaf_index(): number;
    process_message(provider: Provider, msg: Uint8Array): ProcessedMessage;
    remove_members(provider: Provider, sender: Identity, leaf_indices: Uint32Array): RemoveMessages;
    self_update(provider: Provider, sender: Identity): UpdateMessages;
}

export class Identity {
    free(): void;
    [Symbol.dispose](): void;
    static from_bytes(provider: Provider, bytes: Uint8Array): Identity;
    key_package(provider: Provider): KeyPackage;
    constructor(provider: Provider, name: string);
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
    static from_bytes(bytes: Uint8Array): Provider;
    constructor();
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

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_addmessages_free: (a: number, b: number) => void;
    readonly __wbg_group_free: (a: number, b: number) => void;
    readonly __wbg_identity_free: (a: number, b: number) => void;
    readonly __wbg_keypackage_free: (a: number, b: number) => void;
    readonly __wbg_memberinfo_free: (a: number, b: number) => void;
    readonly __wbg_nowelcomeerror_free: (a: number, b: number) => void;
    readonly __wbg_processedmessage_free: (a: number, b: number) => void;
    readonly __wbg_provider_free: (a: number, b: number) => void;
    readonly __wbg_ratchettree_free: (a: number, b: number) => void;
    readonly __wbg_removemessages_free: (a: number, b: number) => void;
    readonly __wbg_updatemessages_free: (a: number, b: number) => void;
    readonly addmessages_commit: (a: number) => any;
    readonly addmessages_welcome: (a: number) => any;
    readonly group_add_member: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly group_clear_pending_commit: (a: number, b: number) => [number, number];
    readonly group_create_message: (
        a: number,
        b: number,
        c: number,
        d: number,
        e: number,
    ) => [number, number, number, number];
    readonly group_create_new: (a: number, b: number, c: number, d: number) => number;
    readonly group_delete: (a: number, b: number) => [number, number];
    readonly group_epoch: (a: number) => bigint;
    readonly group_export_key: (
        a: number,
        b: number,
        c: number,
        d: number,
        e: number,
        f: number,
        g: number,
    ) => [number, number, number, number];
    readonly group_export_ratchet_tree: (a: number) => number;
    readonly group_group_id: (a: number) => [number, number];
    readonly group_is_active: (a: number) => number;
    readonly group_join: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly group_load: (a: number, b: number, c: number) => [number, number, number];
    readonly group_members: (a: number) => [number, number];
    readonly group_merge_pending_commit: (a: number, b: number) => [number, number];
    readonly group_own_leaf_index: (a: number) => number;
    readonly group_process_message: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly group_remove_members: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly group_self_update: (a: number, b: number, c: number) => [number, number, number];
    readonly identity_from_bytes: (a: number, b: number, c: number) => [number, number, number];
    readonly identity_key_package: (a: number, b: number) => number;
    readonly identity_new: (a: number, b: number, c: number) => [number, number, number];
    readonly identity_to_bytes: (a: number) => [number, number, number, number];
    readonly keypackage_from_bytes: (a: number, b: number) => [number, number, number];
    readonly keypackage_to_bytes: (a: number) => [number, number];
    readonly memberinfo_encryption_key: (a: number) => [number, number];
    readonly memberinfo_identity: (a: number) => [number, number];
    readonly memberinfo_index: (a: number) => number;
    readonly memberinfo_signature_key: (a: number) => [number, number];
    readonly processedmessage_msg_type: (a: number) => [number, number];
    readonly processedmessage_payload: (a: number) => [number, number];
    readonly provider_from_bytes: (a: number, b: number) => [number, number, number];
    readonly provider_new: () => number;
    readonly provider_to_bytes: (a: number) => [number, number, number, number];
    readonly ratchettree_from_bytes: (a: number, b: number) => [number, number, number];
    readonly ratchettree_to_bytes: (a: number) => [number, number];
    readonly removemessages_commit: (a: number) => any;
    readonly updatemessages_commit: (a: number) => any;
    readonly updatemessages_welcome: (a: number) => any;
    readonly greet: () => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init(
    module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>,
): Promise<InitOutput>;
