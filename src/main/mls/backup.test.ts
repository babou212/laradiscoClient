import { describe, expect, it } from 'vitest';
import { decryptBundle, encryptBundle, generateRecoveryCode } from './backup';

describe('backup', () => {
    it('generates a grouped high-entropy recovery code', () => {
        const code = generateRecoveryCode();
        expect(code).toMatch(/^[0-9A-F]{5}(-[0-9A-F]{5}){7}$/);
        expect(generateRecoveryCode()).not.toBe(code);
    });

    it('round-trips a bundle through Argon2id + AES-256-GCM', () => {
        const code = generateRecoveryCode();
        const secret = JSON.stringify({ provider: 'AAAA', history: [{ id: '1', content: 'hi' }] });
        const backup = encryptBundle(code, secret);

        expect(backup.encrypted_bundle).not.toContain('provider');
        expect(backup.argon2_params.memory).toBeGreaterThanOrEqual(65536);
        expect(decryptBundle(code, backup)).toBe(secret);
    });

    it('fails to decrypt with the wrong recovery code', () => {
        const backup = encryptBundle(generateRecoveryCode(), 'top secret');
        expect(() => decryptBundle(generateRecoveryCode(), backup)).toThrow();
    });

    it('rejects a tampered ciphertext (GCM auth)', () => {
        const code = generateRecoveryCode();
        const backup = encryptBundle(code, 'integrity matters');
        const bytes = Buffer.from(backup.encrypted_bundle, 'base64');
        bytes[0] ^= 0xff; // flip a byte
        const tampered = { ...backup, encrypted_bundle: bytes.toString('base64') };
        expect(() => decryptBundle(code, tampered)).toThrow();
    });

    it('produces a fresh salt and nonce per backup', () => {
        const code = generateRecoveryCode();
        const a = encryptBundle(code, 'x');
        const b = encryptBundle(code, 'x');
        expect(a.salt).not.toBe(b.salt);
        expect(a.nonce).not.toBe(b.nonce);
        expect(a.encrypted_bundle).not.toBe(b.encrypted_bundle);
    });

    it('emits Argon2 params within the backend-accepted bounds', () => {
        const { argon2_params: p } = encryptBundle(generateRecoveryCode(), 'x');
        expect(p.memory).toBeGreaterThanOrEqual(65536);
        expect(p.iterations).toBeGreaterThanOrEqual(2);
        expect(p.parallelism).toBeGreaterThanOrEqual(1);
    });

    it('round-trips a large history bundle', () => {
        const code = generateRecoveryCode();
        const history = Array.from({ length: 500 }, (_, i) => ({ id: String(i), content: `message ${i}` }));
        const secret = JSON.stringify({ provider: 'x'.repeat(10000), history });
        expect(decryptBundle(code, encryptBundle(code, secret))).toBe(secret);
    });

    it('clamps server-supplied Argon2 params (tampered params fail auth, no OOM)', () => {
        const code = generateRecoveryCode();
        const backup = encryptBundle(code, 'secret');
        const tampered = { ...backup, argon2_params: { ...backup.argon2_params, memory: 1 } };
        expect(() => decryptBundle(code, tampered)).toThrow();
    });

    it('treats the recovery code hyphens as cosmetic', () => {
        const code = generateRecoveryCode();
        const backup = encryptBundle(code, 'grouped or not');
        expect(decryptBundle(code.replace(/-/g, ''), backup)).toBe('grouped or not');
    });
});
