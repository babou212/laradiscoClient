import { createRequire } from 'node:module';
import { join } from 'node:path';

import type * as WasmTypes from './wasm/openmls_wasm';

const _require = createRequire(import.meta.url);
const wasmPath = join(__dirname, 'wasm', 'openmls_wasm.js');
const wasm = _require(wasmPath);

export const Provider: typeof WasmTypes.Provider = wasm.Provider;
export type Provider = WasmTypes.Provider;
export const Identity: typeof WasmTypes.Identity = wasm.Identity;
export type Identity = WasmTypes.Identity;
export const Group: typeof WasmTypes.Group = wasm.Group;
export type Group = WasmTypes.Group;
export const KeyPackage: typeof WasmTypes.KeyPackage = wasm.KeyPackage;
export type KeyPackage = WasmTypes.KeyPackage;
export const RatchetTree: typeof WasmTypes.RatchetTree = wasm.RatchetTree;
export type RatchetTree = WasmTypes.RatchetTree;

export type AddMessages = WasmTypes.AddMessages;
export type RemoveMessages = WasmTypes.RemoveMessages;
export type UpdateMessages = WasmTypes.UpdateMessages;
export type ProcessedMessage = WasmTypes.ProcessedMessage;
export type MemberInfo = WasmTypes.MemberInfo;
