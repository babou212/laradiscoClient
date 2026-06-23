import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sound } from '@/api/soundboard';
import { deleteSound, listSounds, playSound, uploadSound } from '@/api/soundboard';
import { useAuthStore } from './auth';
import { useSoundboardStore } from './soundboard';

vi.mock('@/api/soundboard', () => ({
    listSounds: vi.fn(),
    uploadSound: vi.fn(),
    deleteSound: vi.fn(),
    playSound: vi.fn(),
}));

// Stub the voice store so we don't drag in livekit-client; expose mutable state.
const voiceStub = vi.hoisted(() => ({
    currentChannel: null as { id: number; name: string } | null,
    isSoundMuted: false,
    selectedSpeakerDeviceId: undefined as string | undefined,
}));
vi.mock('./voice', () => ({ useVoiceStore: () => voiceStub }));

class FakeAudio {
    static instances: FakeAudio[] = [];
    src: string;
    volume = 1;
    sinkId: string | null = null;
    play = vi.fn(() => Promise.resolve());
    pause = vi.fn();
    setSinkId = vi.fn((id: string) => {
        this.sinkId = id;
        return Promise.resolve();
    });
    addEventListener = vi.fn();
    constructor(src: string) {
        this.src = src;
        FakeAudio.instances.push(this);
    }
}

function sound(overrides: Partial<Sound> = {}): Sound {
    return {
        id: '1',
        name: 'Airhorn',
        durationMs: 4200,
        url: 'https://cdn.test/airhorn.ogg',
        mimeType: 'audio/ogg',
        uploadedById: '7',
        ...overrides,
    };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
    setActivePinia(createPinia());
    voiceStub.currentChannel = null;
    voiceStub.isSoundMuted = false;
    voiceStub.selectedSpeakerDeviceId = undefined;
    FakeAudio.instances = [];
    vi.stubGlobal('Audio', FakeAudio);
});

afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe('fetchSounds', () => {
    it('loads the library and toggles isLoading', async () => {
        vi.mocked(listSounds).mockResolvedValue([sound({ id: '1' }), sound({ id: '2', name: 'Boo' })]);
        const store = useSoundboardStore();

        const promise = store.fetchSounds();
        expect(store.isLoading).toBe(true);
        await promise;

        expect(store.sounds.map((s) => s.id)).toEqual(['1', '2']);
        expect(store.isLoading).toBe(false);
    });
});

describe('ensureLoaded', () => {
    it('loads settings and fetches once, then no-ops until forced', async () => {
        vi.mocked(listSounds).mockResolvedValue([sound()]);
        const store = useSoundboardStore();

        await store.ensureLoaded();
        await store.ensureLoaded();
        expect(listSounds).toHaveBeenCalledTimes(1);
        expect(window.api.settings.get).toHaveBeenCalledWith('voice:soundboardVolume');

        await store.ensureLoaded(true);
        expect(listSounds).toHaveBeenCalledTimes(2);
    });
});

describe('volume', () => {
    it('clamps to 0..1 and persists', () => {
        const store = useSoundboardStore();

        store.setVolume(1.5);
        expect(store.volume).toBe(1);
        store.setVolume(-2);
        expect(store.volume).toBe(0);
        expect(window.api.settings.set).toHaveBeenCalledWith('voice:soundboardVolume', '0');
    });

    it('loads a persisted volume', async () => {
        vi.mocked(window.api.settings.get).mockResolvedValue('0.5');
        const store = useSoundboardStore();

        await store.loadSettings();
        expect(store.volume).toBe(0.5);
    });
});

describe('library mutations', () => {
    it('prepends an uploaded sound', async () => {
        vi.mocked(uploadSound).mockResolvedValue(sound({ id: 'new' }));
        const store = useSoundboardStore();
        store.sounds = [sound({ id: 'old' })];

        await store.upload('Name', new Blob(['x']), 'clip.ogg');

        expect(store.sounds.map((s) => s.id)).toEqual(['new', 'old']);
        expect(store.isUploading).toBe(false);
    });

    it('removes a deleted sound', async () => {
        vi.mocked(deleteSound).mockResolvedValue(undefined);
        const store = useSoundboardStore();
        store.sounds = [sound({ id: 'a' }), sound({ id: 'b' })];

        await store.remove('a');

        expect(deleteSound).toHaveBeenCalledWith('a');
        expect(store.sounds.map((s) => s.id)).toEqual(['b']);
    });
});

describe('canDelete', () => {
    function setUser(user: { id: string; canManageServer?: boolean; isAdministrator?: boolean } | null) {
        const auth = useAuthStore();
        auth.user = user
            ? ({
                  id: user.id,
                  username: 'u',
                  email: 'u@test',
                  avatar_urls: null,
                  permissions: {
                      canInviteMembers: false,
                      canManageRoles: false,
                      canManageChannels: false,
                      canManageServer: !!user.canManageServer,
                      canManageMessages: false,
                      canBanMembers: false,
                      canKickMembers: false,
                      canViewAuditLog: false,
                      isAdministrator: !!user.isAdministrator,
                      isBanned: false,
                      isJailed: false,
                  },
              } as never)
            : null;
    }

    it('allows the uploader', () => {
        setUser({ id: '7' });
        expect(useSoundboardStore().canDelete(sound({ uploadedById: '7' }))).toBe(true);
    });

    it('allows a manage-server user for any sound', () => {
        setUser({ id: '1', canManageServer: true });
        expect(useSoundboardStore().canDelete(sound({ uploadedById: '7' }))).toBe(true);
    });

    it('allows an administrator for any sound', () => {
        setUser({ id: '1', isAdministrator: true });
        expect(useSoundboardStore().canDelete(sound({ uploadedById: '7' }))).toBe(true);
    });

    it('denies an unrelated member', () => {
        setUser({ id: '2' });
        expect(useSoundboardStore().canDelete(sound({ uploadedById: '7' }))).toBe(false);
    });

    it('denies when logged out', () => {
        setUser(null);
        expect(useSoundboardStore().canDelete(sound())).toBe(false);
    });
});

describe('trigger', () => {
    it('plays the sound in the current channel', async () => {
        vi.mocked(playSound).mockResolvedValue(undefined);
        voiceStub.currentChannel = { id: 5, name: 'General' };
        const store = useSoundboardStore();

        await store.trigger('7');

        expect(playSound).toHaveBeenCalledWith(5, '7');
    });

    it('does nothing when not in a voice channel', async () => {
        const store = useSoundboardStore();
        await store.trigger('7');
        expect(playSound).not.toHaveBeenCalled();
    });
});

describe('handleIncoming', () => {
    function packet(payload: object): Uint8Array {
        return new TextEncoder().encode(JSON.stringify(payload));
    }

    it('plays a valid play_sound packet through the selected output device', async () => {
        voiceStub.selectedSpeakerDeviceId = 'speaker-2';
        const store = useSoundboardStore();

        store.handleIncoming(packet({ type: 'play_sound', sound_id: 7, url: 'https://cdn.test/a.ogg' }));
        await flush();

        expect(FakeAudio.instances).toHaveLength(1);
        const audio = FakeAudio.instances[0];
        expect(audio.src).toBe('https://cdn.test/a.ogg');
        expect(audio.setSinkId).toHaveBeenCalledWith('speaker-2');
        expect(audio.play).toHaveBeenCalled();
    });

    it('does not play when the local user is deafened', async () => {
        voiceStub.isSoundMuted = true;
        const store = useSoundboardStore();

        store.handleIncoming(packet({ type: 'play_sound', url: 'https://cdn.test/a.ogg' }));
        await flush();

        expect(FakeAudio.instances).toHaveLength(0);
    });

    it('ignores packets of other types', async () => {
        const store = useSoundboardStore();
        store.handleIncoming(packet({ type: 'something_else', url: 'https://cdn.test/a.ogg' }));
        await flush();
        expect(FakeAudio.instances).toHaveLength(0);
    });

    it('ignores malformed payloads', async () => {
        const store = useSoundboardStore();
        store.handleIncoming(new TextEncoder().encode('not json'));
        await flush();
        expect(FakeAudio.instances).toHaveLength(0);
    });
});
