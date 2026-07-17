import { describe, expect, it, vi } from 'vitest';

vi.mock('../auth-storage', () => ({ getAuthSession: () => ({ user_id: 1 }) }));

import { decryptLocal, encryptLocal } from './localcipher';

describe('localcipher', () => {
    it('round-trips plaintext (safeStorage-keyed AES-GCM)', () => {
        const secret = 'a private direct message 🕵️';
        expect(decryptLocal(encryptLocal(secret))).toBe(secret);
    });

    it('produces a distinct ciphertext each time (random nonce)', () => {
        expect(encryptLocal('same')).not.toBe(encryptLocal('same'));
    });

    it('does not leak plaintext into the ciphertext', () => {
        expect(encryptLocal('topsecret')).not.toContain('topsecret');
    });

    it('rejects a tampered blob (GCM auth)', () => {
        const blob = Buffer.from(encryptLocal('integrity'), 'base64');
        blob[blob.length - 1] ^= 0xff; // corrupt the tag
        expect(() => decryptLocal(blob.toString('base64'))).toThrow();
    });
});
