// User-level identity key operations. Each device holds one Ed25519 identity
// keypair (generated at setup); its public half is published to the backend and
// used by peers to attest that a device/KeyPackage genuinely belongs to a user.
// This binding is what a malicious server cannot forge.

import { createPrivateKey, createPublicKey, createHash, sign, verify } from 'node:crypto';

function privFromB64(pkcs8B64: string): ReturnType<typeof createPrivateKey> {
    return createPrivateKey({ key: Buffer.from(pkcs8B64, 'base64'), format: 'der', type: 'pkcs8' });
}

function pubFromB64(spkiB64: string): ReturnType<typeof createPublicKey> {
    return createPublicKey({ key: Buffer.from(spkiB64, 'base64'), format: 'der', type: 'spki' });
}

/** Derive the SPKI-DER base64 public key from a PKCS8-DER base64 private key. */
export function publicFromPrivate(privB64: string): string {
    return createPublicKey(privFromB64(privB64)).export({ type: 'spki', format: 'der' }).toString('base64');
}

/** Sign KeyPackage bytes with the user identity private key → base64 signature. */
export function signKeyPackage(identityPrivB64: string, keyPackageBytes: Uint8Array): string {
    // Ed25519: algorithm must be null.
    return sign(null, Buffer.from(keyPackageBytes), privFromB64(identityPrivB64)).toString('base64');
}

/** Verify a KeyPackage's identity signature against the owner's identity key. */
export function verifyKeyPackage(
    identityKeyPubB64: string,
    keyPackageBytes: Uint8Array,
    signatureB64: string,
): boolean {
    try {
        return verify(
            null,
            Buffer.from(keyPackageBytes),
            pubFromB64(identityKeyPubB64),
            Buffer.from(signatureB64, 'base64'),
        );
    } catch {
        return false;
    }
}

/**
 * A stable, symmetric safety number for two identity keys — both parties compute
 * the same value (keys are sorted first) for out-of-band comparison. 60 digits
 * in 12 groups of 5, à la Signal.
 */
export function safetyNumber(identityKeyA: string, identityKeyB: string): string {
    const [a, b] = [identityKeyA, identityKeyB].sort();
    const digest = createHash('sha512').update(a).update('|').update(b).digest();
    const groups: string[] = [];
    for (let i = 0; i < 12; i++) {
        // 5 digits per group from 5 bytes of the digest.
        const n = digest.readUIntBE(i * 5, 5) % 100000;
        groups.push(n.toString().padStart(5, '0'));
    }
    return groups.join(' ');
}
