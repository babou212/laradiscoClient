import { mount } from '@vue/test-utils';
import { ConnectionQuality } from 'livekit-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceStore } from '@/stores/voice';
import VoiceControlPanel from './VoiceControlPanel.vue';

vi.mock('livekit-client', async () => await import('@/../../../test/mocks/livekit'));
vi.mock('@/lib/echo', async () => (await import('@/../../../test/helpers/echo')).echoMockFactory());
vi.mock('@/api/voice', () => ({
    getVoiceParticipants: vi.fn(),
    joinVoiceChannel: vi.fn(),
    leaveVoiceMembership: vi.fn(),
}));
vi.mock('@/lib/ptt-sounds', () => ({ playPttActivateSound: vi.fn(), playPttDeactivateSound: vi.fn() }));

const stubs = {
    SimpleTooltip: { template: '<div><slot /></div>' },
};

function mountPanel() {
    return mount(VoiceControlPanel, { global: { stubs } });
}

function connect(voice: ReturnType<typeof useVoiceStore>, patch: Record<string, unknown> = {}) {
    voice.$patch({ currentChannel: { id: 5, name: 'Lounge' }, ...patch } as never);
}

beforeEach(() => {
    // jsdom does not implement SVG className the way Vue stub matching needs; nothing to do here.
});

describe('VoiceControlPanel visibility', () => {
    it('renders nothing when not connected', () => {
        expect(mountPanel().find('button').exists()).toBe(false);
    });

    it('renders controls and the channel name when connected', () => {
        const voice = useVoiceStore();
        connect(voice);
        const wrapper = mountPanel();
        expect(wrapper.text()).toContain('Lounge');
        // disconnect + mic + sound + screen share
        expect(wrapper.findAll('button').length).toBeGreaterThanOrEqual(4);
    });
});

describe('VoiceControlPanel connection quality', () => {
    it('shows the connected label for excellent quality', () => {
        const voice = useVoiceStore();
        connect(voice, { connectionQuality: ConnectionQuality.Excellent });
        expect(mountPanel().text()).toContain('Voice Connected');
    });

    it('shows the poor connection label', () => {
        const voice = useVoiceStore();
        connect(voice, { connectionQuality: ConnectionQuality.Poor });
        expect(mountPanel().text()).toContain('Poor Connection');
    });

    it('shows the connection lost label', () => {
        const voice = useVoiceStore();
        // The shared livekit mock omits the `Lost` member, so use the raw value the switch matches.
        connect(voice, { connectionQuality: 'lost' });
        expect(mountPanel().text()).toContain('Connection Lost');
    });
});

describe('VoiceControlPanel mute toggles', () => {
    it('calls toggleMic when the mic button is clicked', async () => {
        const voice = useVoiceStore();
        connect(voice);
        const toggleMic = vi.spyOn(voice, 'toggleMic').mockResolvedValue(undefined as never);
        const wrapper = mountPanel();
        // buttons: [disconnect, mic, sound, screenshare]
        await wrapper.findAll('button')[1].trigger('click');
        expect(toggleMic).toHaveBeenCalled();
    });

    it('calls toggleSound when the deafen button is clicked', async () => {
        const voice = useVoiceStore();
        connect(voice);
        const toggleSound = vi.spyOn(voice, 'toggleSound').mockResolvedValue(undefined as never);
        const wrapper = mountPanel();
        await wrapper.findAll('button')[2].trigger('click');
        expect(toggleSound).toHaveBeenCalled();
    });

    it('shows the muted mic icon when mic is muted', () => {
        const voice = useVoiceStore();
        connect(voice, { isMicMuted: true });
        expect(mountPanel().find('.lucide-mic-off-icon').exists()).toBe(true);
    });

    it('shows the deafened icon when sound is muted', () => {
        const voice = useVoiceStore();
        connect(voice, { isSoundMuted: true });
        expect(mountPanel().find('.lucide-volume-off-icon').exists()).toBe(true);
    });
});

describe('VoiceControlPanel screen share', () => {
    it('starts screen share when not sharing', async () => {
        const voice = useVoiceStore();
        connect(voice, { isScreenSharing: false });
        const start = vi.spyOn(voice, 'startScreenShare').mockResolvedValue(undefined as never);
        const wrapper = mountPanel();
        await wrapper.findAll('button')[3].trigger('click');
        expect(start).toHaveBeenCalled();
    });

    it('stops screen share when already sharing', async () => {
        const voice = useVoiceStore();
        connect(voice, { isScreenSharing: true });
        const stop = vi.spyOn(voice, 'stopScreenShare').mockResolvedValue(undefined as never);
        const wrapper = mountPanel();
        await wrapper.findAll('button')[3].trigger('click');
        expect(stop).toHaveBeenCalled();
    });
});

describe('VoiceControlPanel disconnect and audio playback', () => {
    it('leaves the channel when the disconnect button is clicked', async () => {
        const voice = useVoiceStore();
        connect(voice);
        const leave = vi.spyOn(voice, 'leaveChannel').mockResolvedValue(undefined as never);
        const wrapper = mountPanel();
        await wrapper.findAll('button')[0].trigger('click');
        expect(leave).toHaveBeenCalled();
    });

    it('shows the enable-audio prompt and triggers playback when blocked', async () => {
        const voice = useVoiceStore();
        connect(voice, { isAudioPlaybackBlocked: true });
        const enable = vi.spyOn(voice, 'enableAudioPlayback').mockResolvedValue(undefined as never);
        const wrapper = mountPanel();
        const prompt = wrapper.findAll('button').find((b) => b.text().includes('enable audio'));
        expect(prompt).toBeTruthy();
        await prompt!.trigger('click');
        expect(enable).toHaveBeenCalled();
    });
});
