import { ed25519 } from '@noble/curves/ed25519.js';
import { x25519 } from '@noble/curves/ed25519.js';
import type {
    DeviceIdentityKeyPair,
    KeyPair,
    OneTimePreKey,
    SignedPreKey,
    UserIdentityKeyPair,
} from './types';

export function generateUserIdentityKeyPair(): UserIdentityKeyPair {
    const privateKey = new Uint8Array(ed25519.utils.randomSecretKey());
    const publicKey = new Uint8Array(ed25519.getPublicKey(privateKey));
    return { publicKey, privateKey };
}

export function generateDeviceIdentityKeyPair(
    userIdentityPrivateKey: Uint8Array<ArrayBuffer>,
): DeviceIdentityKeyPair {
    const privateKey = new Uint8Array(ed25519.utils.randomSecretKey());
    const publicKey = new Uint8Array(ed25519.getPublicKey(privateKey));

    const signature = new Uint8Array(ed25519.sign(publicKey, userIdentityPrivateKey));

    return { publicKey, privateKey, signature };
}

export function verifyDeviceSignature(
    devicePublicKey: Uint8Array<ArrayBuffer>,
    signature: Uint8Array<ArrayBuffer>,
    userIdentityPublicKey: Uint8Array<ArrayBuffer>,
): boolean {
    try {
        return ed25519.verify(signature, devicePublicKey, userIdentityPublicKey);
    } catch {
        return false;
    }
}

export function ed25519PrivateToX25519(ed25519PrivateKey: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    return new Uint8Array(ed25519.utils.toMontgomerySecret(ed25519PrivateKey));
}

export function ed25519PublicToX25519(ed25519PublicKey: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    return new Uint8Array(ed25519.utils.toMontgomery(ed25519PublicKey));
}

export function generateSignedPreKey(
    deviceIdentityPrivateKey: Uint8Array<ArrayBuffer>,
    id: number,
): SignedPreKey {
    const privateKey = new Uint8Array(x25519.utils.randomSecretKey());
    const publicKey = new Uint8Array(x25519.getPublicKey(privateKey));

    const signature = new Uint8Array(ed25519.sign(publicKey, deviceIdentityPrivateKey));

    return {
        id,
        keyPair: { publicKey, privateKey },
        signature,
        timestamp: Date.now(),
    };
}

export function generateOneTimePreKeys(startId: number, count: number): OneTimePreKey[] {
    const preKeys: OneTimePreKey[] = [];
    for (let i = 0; i < count; i++) {
        const privateKey = new Uint8Array(x25519.utils.randomSecretKey());
        const publicKey = new Uint8Array(x25519.getPublicKey(privateKey));
        preKeys.push({
            id: startId + i,
            keyPair: { publicKey, privateKey },
        });
    }
    return preKeys;
}

export function x25519DH(privateKey: Uint8Array<ArrayBuffer>, publicKey: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    return new Uint8Array(x25519.getSharedSecret(privateKey, publicKey));
}

export function sign(data: Uint8Array<ArrayBuffer>, privateKey: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
    return new Uint8Array(ed25519.sign(data, privateKey));
}

export function verify(
    signature: Uint8Array<ArrayBuffer>,
    data: Uint8Array<ArrayBuffer>,
    publicKey: Uint8Array<ArrayBuffer>,
): boolean {
    try {
        return ed25519.verify(signature, data, publicKey);
    } catch {
        return false;
    }
}

export function generateX25519KeyPair(): KeyPair {
    const privateKey = new Uint8Array(x25519.utils.randomSecretKey());
    const publicKey = new Uint8Array(x25519.getPublicKey(privateKey));
    return { publicKey, privateKey };
}

export function generateUUID(): string {
    return crypto.randomUUID();
}
