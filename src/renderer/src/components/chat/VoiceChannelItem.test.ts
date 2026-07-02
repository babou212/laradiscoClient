import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import type { VoiceParticipant } from '@/stores/voice';
import { useVoiceStore } from '@/stores/voice';
import VoiceChannelItem from './VoiceChannelItem.vue';

vi.mock('livekit-client', async () => await import('@/../../../test/mocks/livekit'));
vi.mock('@/lib/echo', async () => (await import('@/../../../test/helpers/echo')).echoMockFactory());
vi.mock('@/api/voice', () => ({
    getVoiceParticipants: vi.fn(),
    joinVoiceChannel: vi.fn(),
    leaveVoiceMembership: vi.fn(),
}));
vi.mock('@/lib/ptt-sounds', () => ({ playPttActivateSound: vi.fn(), playPttDeactivateSound: vi.fn() }));

const stubs = {
    Avatar: { template: '<div class="avatar"><slot /></div>' },
    AvatarImage: { template: '<img />' },
    AvatarFallback: { template: '<div class="avatar-fallback"><slot /></div>' },
    DropdownMenu: { template: '<div><slot /></div>' },
    DropdownMenuTrigger: { template: '<div><slot /></div>' },
    DropdownMenuContent: { template: '<div class="dropdown-content"><slot /></div>' },
    DropdownMenuLabel: { template: '<div><slot /></div>' },
    DropdownMenuSeparator: { template: '<div />' },
    Slider: { template: '<div class="slider" />' },
};

function participant(overrides: Partial<VoiceParticipant> = {}): VoiceParticipant {
    return {
        id: '7',
        username: 'alice',
        displayName: 'Alice',
        isSpeaking: false,
        isMuted: false,
        isScreenSharing: false,
        avatarUrls: null,
        ...overrides,
    };
}

const channel = { id: '5', name: 'Lounge', topic: null, type: 'voice' };

function mountItem() {
    return mount(VoiceChannelItem, { props: { channel, categoryId: '3' }, global: { stubs } });
}

/** Seed cached participants for a not-yet-joined channel (the map is store-private). */
function seedCached(voice: ReturnType<typeof useVoiceStore>, participants: VoiceParticipant[]) {
    vi.spyOn(voice, 'getChannelParticipants').mockReturnValue(participants);
}

beforeEach(() => {
    useAuthStore().user = { id: '99', username: 'me', display_name: 'Me' } as never;
});

describe('VoiceChannelItem rendering', () => {
    it('shows the channel name', () => {
        expect(mountItem().text()).toContain('Lounge');
    });

    it('renders cached participants for a channel it is not in', () => {
        const voice = useVoiceStore();
        seedCached(voice, [participant()]);
        expect(mountItem().text()).toContain('Alice');
    });

    it('shows current participants when this is the active channel', () => {
        const voice = useVoiceStore();
        voice.$patch({
            currentChannel: { id: 5, name: 'Lounge' },
            currentParticipants: [participant({ displayName: 'Bob' })],
        } as never);
        expect(mountItem().text()).toContain('Bob');
    });

    it('renders a muted indicator for muted participants', () => {
        const voice = useVoiceStore();
        seedCached(voice, [participant({ isMuted: true })]);
        const wrapper = mountItem();
        // MicOff lucide icon renders only when muted.
        expect(wrapper.find('.lucide-mic-off-icon').exists()).toBe(true);
    });

    it('does not render a muted indicator for unmuted participants', () => {
        const voice = useVoiceStore();
        seedCached(voice, [participant({ isMuted: false })]);
        expect(mountItem().find('.lucide-mic-off-icon').exists()).toBe(false);
    });

    it('applies the speaking ring to speaking participants', () => {
        const voice = useVoiceStore();
        seedCached(voice, [participant({ isSpeaking: true })]);
        expect(mountItem().html()).toContain('ring-green-500');
    });
});

describe('VoiceChannelItem join behaviour', () => {
    it('joins the channel on click when not already in it', async () => {
        const voice = useVoiceStore();
        const join = vi.spyOn(voice, 'joinChannel').mockResolvedValue(undefined as never);
        await mountItem().get('button').trigger('click');
        expect(join).toHaveBeenCalledWith(5, 'Lounge');
    });

    it('does not re-join when it is already the current channel', async () => {
        const voice = useVoiceStore();
        voice.$patch({ currentChannel: { id: 5, name: 'Lounge' } } as never);
        const join = vi.spyOn(voice, 'joinChannel').mockResolvedValue(undefined as never);
        await mountItem().get('button').trigger('click');
        expect(join).not.toHaveBeenCalled();
    });

    it('sets the active screen-share view when a sharing participant icon is clicked', async () => {
        const voice = useVoiceStore();
        seedCached(voice, [participant({ id: '7', isScreenSharing: true })]);
        const wrapper = mountItem();
        await wrapper.find('.lucide-monitor-icon').trigger('click');
        expect(voice.activeScreenShareView).toBe('7');
    });
});
