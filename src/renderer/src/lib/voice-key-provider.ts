import { BaseKeyProvider, createKeyMaterialFromString } from 'livekit-client';

/**
 * A shared-key E2EE provider that can apply a key at an explicit key index.
 *
 * The built-in `ExternalE2EEKeyProvider` always writes to key index 0, so it
 * cannot hold two keys at once and every `setKey` is a hard cutover. This
 * provider keeps a keyring (the previous key stays available), so when the room
 * rotates the shared key — e.g. after a participant leaves — in-flight media
 * frames still tagged with the old key index continue to decrypt while everyone
 * switches their encrypt key to the new index. That makes rotation seamless
 * instead of glitchy.
 *
 * `failureTolerance: -1` and `ratchetWindowSize: 0` match the built-in provider:
 * with a shared key we never want a single decrypt failure to auto-invalidate
 * or auto-ratchet the key for everyone.
 */
export class IndexedKeyProvider extends BaseKeyProvider {
    constructor() {
        super({ sharedKey: true, ratchetWindowSize: 0, failureTolerance: -1, keyringSize: 16 });
    }

    /** Derive and install the shared key at the given key index. */
    async setKeyAt(passphrase: string, keyIndex: number): Promise<void> {
        const material = await createKeyMaterialFromString(passphrase);
        this.onSetEncryptionKey(material, undefined, keyIndex);
    }
}
