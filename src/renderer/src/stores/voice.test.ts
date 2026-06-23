import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SCREEN_SHARE_PRESETS, useVoiceStore } from './voice';

vi.mock('livekit-client', async () => await import('@/../../../test/mocks/livekit'));
vi.mock('@/lib/echo', async () => (await import('@/../../../test/helpers/echo')).echoMockFactory());
vi.mock('@/api/voice', () => ({
    getVoiceParticipants: vi.fn(),
    joinVoiceChannel: vi.fn(),
    leaveVoiceMembership: vi.fn(),
}));
vi.mock('@/lib/ptt-sounds', () => ({ playPttActivateSound: vi.fn(), playPttDeactivateSound: vi.fn() }));

beforeEach(() => {
    setActivePinia(createPinia());
});

describe('SCREEN_SHARE_PRESETS', () => {
    it('defines all four quality tiers with sane dimensions', () => {
        expect(Object.keys(SCREEN_SHARE_PRESETS).sort()).toEqual(['high', 'low', 'medium', 'source']);
        expect(SCREEN_SHARE_PRESETS.low.height).toBe(720);
        expect(SCREEN_SHARE_PRESETS.medium.height).toBe(1080);
        expect(SCREEN_SHARE_PRESETS.source.width).toBe(0); // source = native, no downscale
    });
});

describe('user volume', () => {
    it('defaults to 1 (100%)', () => {
        expect(useVoiceStore().getUserVolume('42')).toBe(1);
    });

    it('clamps set values to the 0..2 range and persists them', () => {
        const voice = useVoiceStore();
        voice.setUserVolume('42', 5);
        expect(voice.getUserVolume('42')).toBe(2);
        voice.setUserVolume('42', -3);
        expect(voice.getUserVolume('42')).toBe(0);
        expect(window.api.settings.set).toHaveBeenCalledWith('voice:userVolumes', expect.any(String));
    });
});

describe('mute toggles', () => {
    it('toggles mic and sound mute flags when not in a room', async () => {
        const voice = useVoiceStore();
        expect(voice.isMicMuted).toBe(false);
        await voice.toggleMic();
        expect(voice.isMicMuted).toBe(true);

        expect(voice.isSoundMuted).toBe(false);
        await voice.toggleSound();
        expect(voice.isSoundMuted).toBe(true);
    });
});
