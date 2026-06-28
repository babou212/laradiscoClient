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

describe('push to talk binding', () => {
    it('persists a keyboard binding and pushes it to the main process', () => {
        const voice = useVoiceStore();
        const binding = {
            device: 'keyboard' as const,
            keycode: 63,
            modifiers: { ctrl: false, shift: true, alt: false, meta: false },
        };
        voice.setPttKey('Shift + F5', binding);

        expect(voice.pttBinding).toEqual(binding);
        expect(window.api.settings.set).toHaveBeenCalledWith('voice:pttKey', 'Shift + F5');
        expect(window.api.settings.set).toHaveBeenCalledWith('voice:pttBinding', JSON.stringify(binding));
        expect(window.api.ptt.configure).toHaveBeenCalledWith({ enabled: false, binding });
    });

    it('persists a mouse-button binding', () => {
        const voice = useVoiceStore();
        const binding = { device: 'mouse' as const, button: 4 };
        voice.setPttKey('Mouse 4', binding);

        expect(voice.pttBinding).toEqual(binding);
        expect(window.api.settings.set).toHaveBeenCalledWith('voice:pttBinding', JSON.stringify(binding));
        expect(window.api.ptt.configure).toHaveBeenCalledWith({ enabled: false, binding });
    });

    it('clears the binding when set to null', () => {
        const voice = useVoiceStore();
        voice.setPttKey(null, null);

        expect(voice.pttBinding).toBeNull();
        expect(window.api.settings.set).toHaveBeenCalledWith('voice:pttKey', '');
        expect(window.api.settings.set).toHaveBeenCalledWith('voice:pttBinding', '');
    });

    it('loads a stored mouse binding from voice:pttBinding', async () => {
        const stored: Record<string, string> = { 'voice:pttBinding': JSON.stringify({ device: 'mouse', button: 5 }) };
        window.api.settings.get = vi.fn((key: string) => Promise.resolve(stored[key] ?? null)) as never;

        const voice = useVoiceStore();
        await voice.loadSettings();

        expect(voice.pttBinding).toEqual({ device: 'mouse', button: 5 });
    });

    it('migrates a legacy keyboard bind when voice:pttBinding is absent', async () => {
        const stored: Record<string, string> = {
            'voice:pttKeycode': '63',
            'voice:pttModifiers': JSON.stringify({ ctrl: true, shift: false, alt: false, meta: false }),
        };
        window.api.settings.get = vi.fn((key: string) => Promise.resolve(stored[key] ?? null)) as never;

        const voice = useVoiceStore();
        await voice.loadSettings();

        expect(voice.pttBinding).toEqual({
            device: 'keyboard',
            keycode: 63,
            modifiers: { ctrl: true, shift: false, alt: false, meta: false },
        });
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
