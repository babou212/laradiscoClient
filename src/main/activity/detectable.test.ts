import { describe, expect, it } from 'vitest';
import { DETECTABLE, resolveIcon, steamCapsuleUrl } from './detectable';

describe('steamCapsuleUrl', () => {
    it('builds the Steam capsule CDN URL', () => {
        expect(steamCapsuleUrl(730)).toBe('https://cdn.cloudflare.steamstatic.com/steam/apps/730/capsule_184x69.jpg');
    });
});

describe('resolveIcon', () => {
    it('prefers Steam capsule art when a steamAppId is present', () => {
        expect(resolveIcon({ application_id: 'a', name: 'A', type: 'game', executables: ['a'], steamAppId: 570 })).toBe(
            steamCapsuleUrl(570),
        );
    });

    it('falls back to an explicit iconUrl', () => {
        expect(
            resolveIcon({
                application_id: 'b',
                name: 'B',
                type: 'app',
                executables: ['b'],
                iconUrl: 'https://x/i.svg',
            }),
        ).toBe('https://x/i.svg');
    });

    it('returns null when no icon source exists', () => {
        expect(resolveIcon({ application_id: 'c', name: 'C', type: 'app', executables: ['c'] })).toBeNull();
    });
});

describe('DETECTABLE data integrity', () => {
    it('has unique application_ids', () => {
        const ids = DETECTABLE.map((e) => e.application_id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('every entry has at least one executable', () => {
        for (const e of DETECTABLE) {
            expect(e.executables.length).toBeGreaterThan(0);
            expect(e.executables.every((x) => x.length > 0)).toBe(true);
        }
    });
});
