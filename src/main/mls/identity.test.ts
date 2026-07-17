import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { safetyNumber, signKeyPackage, verifyKeyPackage } from './identity';

function keypair(): { pub: string; priv: string } {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    return {
        pub: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
        priv: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
    };
}

describe('identity', () => {
    it('verifies a key package signed by the matching identity key', () => {
        const { pub, priv } = keypair();
        const kp = new Uint8Array([1, 2, 3, 4, 5]);
        const sig = signKeyPackage(priv, kp);
        expect(verifyKeyPackage(pub, kp, sig)).toBe(true);
    });

    it('rejects a signature from a different identity key', () => {
        const alice = keypair();
        const mallory = keypair();
        const kp = new Uint8Array([9, 9, 9]);
        const sig = signKeyPackage(mallory.priv, kp);
        // Alice's identity key must NOT validate Mallory's signature (server-injected device).
        expect(verifyKeyPackage(alice.pub, kp, sig)).toBe(false);
    });

    it('rejects a tampered key package', () => {
        const { pub, priv } = keypair();
        const kp = new Uint8Array([1, 2, 3]);
        const sig = signKeyPackage(priv, kp);
        expect(verifyKeyPackage(pub, new Uint8Array([1, 2, 4]), sig)).toBe(false);
    });

    it('returns false on malformed input instead of throwing', () => {
        expect(verifyKeyPackage('not-a-key', new Uint8Array([1]), 'not-a-sig')).toBe(false);
    });

    it('computes a symmetric, deterministic safety number', () => {
        const a = keypair().pub;
        const b = keypair().pub;
        const one = safetyNumber(a, b);
        const two = safetyNumber(b, a); // order-independent
        expect(one).toBe(two);
        expect(one).toMatch(/^(\d{5} ){11}\d{5}$/); // 12 groups of 5 digits
    });

    it('produces different safety numbers for different peers', () => {
        const me = keypair().pub;
        expect(safetyNumber(me, keypair().pub)).not.toBe(safetyNumber(me, keypair().pub));
    });
});
