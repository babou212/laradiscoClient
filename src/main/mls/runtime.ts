import * as wasm from './wasm/openmls_wasm.js';

export const {
    Provider,
    Identity,
    KeyPackage,
    Group,
    RatchetTree,
    ProcessedMessage,
    MemberInfo,
    AddMessages,
    RemoveMessages,
    UpdateMessages,
} = wasm;

export type Provider = wasm.Provider;
export type Identity = wasm.Identity;
export type KeyPackage = wasm.KeyPackage;
export type Group = wasm.Group;
export type ProcessedMessage = wasm.ProcessedMessage;

let initialised = false;

/**
 * Instantiate the WASM module exactly once from its raw bytes. Idempotent.
 * The wasm-bindgen `js` feature routes randomness/time to the JS host, so this
 * requires a JS runtime (Electron main / Node) — not bare WASM.
 */
export function initMls(wasmBytes: Uint8Array): void {
    if (initialised) return;

    const bytes = new Uint8Array(wasmBytes);
    const module = new WebAssembly.Module(bytes);
    wasm.initSync({ module });
    initialised = true;
}

export function isInitialised(): boolean {
    return initialised;
}
