import { saveIdentity, loadIdentity, saveProviderState, loadProviderState, type StoredIdentity } from './storage';
import { Provider, Identity, Group, RatchetTree } from './wasm-loader';

/**
 * Manages the in-memory MLS state (Provider, Identity, Groups) for a server,
 * with persistence to SQLite via the storage module.
 */
export class MlsState {
    provider: Provider;
    identity: Identity | null = null;
    deviceId: string | null = null;
    private serverId: number;

    private constructor(serverId: number, provider: Provider) {
        this.serverId = serverId;
        this.provider = provider;
    }

    /**
     * Initialize MLS state for a server.
     * Restores provider and identity from storage if available.
     */
    static init(serverId: number, userId?: number): MlsState {
        const providerBytes = loadProviderState(serverId);
        let provider: Provider;

        if (providerBytes) {
            provider = Provider.from_bytes(providerBytes);
        } else {
            provider = new Provider();
        }

        const state = new MlsState(serverId, provider);

        const storedIdentity = loadIdentity(serverId, userId);
        if (storedIdentity) {
            state.identity = Identity.from_bytes(provider, storedIdentity.identityBytes);
            state.deviceId = storedIdentity.deviceId;
        }

        return state;
    }

    /**
     * Create a new identity for this server, replacing any existing one.
     */
    setup(deviceId: string, deviceName: string, identityName: string, userId?: number): void {
        this.provider = new Provider();
        this.identity = new Identity(this.provider, identityName);
        this.deviceId = deviceId;

        const identityBytes = this.identity.to_bytes();
        saveIdentity(this.serverId, deviceId, deviceName, userId ?? null, identityBytes);
        this.persistProvider();
    }

    /**
     * Restore identity from serialized bytes (for backup restore or new device setup).
     */
    restoreIdentity(identityBytes: Uint8Array, deviceId: string, deviceName: string, userId?: number): void {
        this.identity = Identity.from_bytes(this.provider, identityBytes);
        this.deviceId = deviceId;

        saveIdentity(this.serverId, deviceId, deviceName, userId ?? null, identityBytes);
        this.persistProvider();
    }

    /**
     * Persist the current provider state to storage.
     * Call this after any operation that modifies group state.
     */
    persistProvider(): void {
        const bytes = this.provider.to_bytes();
        saveProviderState(this.serverId, bytes);
    }

    /**
     * Load a group from the provider's storage by group ID.
     * Returns null if the group doesn't exist yet.
     */
    loadGroup(groupId: string): Group | null {
        try {
            return Group.load(this.provider, groupId);
        } catch {
            return null;
        }
    }

    /**
     * Create a new MLS group.
     */
    createGroup(groupId: string): Group {
        if (!this.identity) throw new Error('MLS identity not set up');
        const group = Group.create_new(this.provider, this.identity, groupId);
        this.persistProvider();
        return group;
    }

    /**
     * Join a group from a Welcome message + ratchet tree.
     */
    joinGroup(welcomeBytes: Uint8Array, ratchetTreeBytes: Uint8Array): Group {
        const ratchetTree = RatchetTree.from_bytes(ratchetTreeBytes);
        const group = Group.join(this.provider, welcomeBytes, ratchetTree);
        this.persistProvider();
        return group;
    }

    get storedIdentity(): StoredIdentity | null {
        return loadIdentity(this.serverId);
    }
}
