import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const settings = new Map<string, string>();
vi.mock('../database', () => ({
    getSetting: (k: string) => settings.get(k) ?? null,
    setSetting: (k: string, v: string) => {
        settings.set(k, v);
    },
}));
vi.mock('../auth-storage', () => ({ getAuthSession: () => ({ user_id: 1 }) }));

import { getOrCreateDeviceId, hasKeystore, loadKeystore, removeKeystore, saveKeystore } from './keystore';

beforeEach(() => {
    settings.clear();
    removeKeystore();
});

describe('keystore', () => {
    it('creates a stable per-install device id', () => {
        const id = getOrCreateDeviceId();
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        expect(getOrCreateDeviceId()).toBe(id);
    });

    it('round-trips provider + identity + user identity key', () => {
        expect(hasKeystore()).toBe(false);
        saveKeystore(new Uint8Array([1, 2, 3, 4]), new Uint8Array([5, 6, 7]), 'priv-key-b64');
        expect(hasKeystore()).toBe(true);

        const loaded = loadKeystore();
        expect(loaded).not.toBeNull();
        expect(Array.from(loaded!.provider)).toEqual([1, 2, 3, 4]);
        expect(Array.from(loaded!.identity)).toEqual([5, 6, 7]);
        expect(loaded!.userIdentityPriv).toBe('priv-key-b64');
    });

    it('supports a null user identity key', () => {
        saveKeystore(new Uint8Array([9]), new Uint8Array([8]), null);
        expect(loadKeystore()!.userIdentityPriv).toBeNull();
    });

    it('overwrites on a second save', () => {
        saveKeystore(new Uint8Array([1]), new Uint8Array([1]), 'a');
        saveKeystore(new Uint8Array([2]), new Uint8Array([2]), 'b');
        const loaded = loadKeystore();
        expect(Array.from(loaded!.provider)).toEqual([2]);
        expect(loaded!.userIdentityPriv).toBe('b');
    });

    it('removeKeystore clears it', () => {
        saveKeystore(new Uint8Array([1]), new Uint8Array([2]), null);
        removeKeystore();
        expect(hasKeystore()).toBe(false);
        expect(loadKeystore()).toBeNull();
    });

    it('returns null for a corrupt keystore file instead of throwing', () => {
        writeFileSync(join(tmpdir(), 'mls-1.bin'), 'not-valid-json');
        expect(loadKeystore()).toBeNull();
    });
});
