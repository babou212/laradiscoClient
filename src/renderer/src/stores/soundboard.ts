import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
    deleteSound as apiDeleteSound,
    listSounds,
    playSound as apiPlaySound,
    uploadSound,
    type Sound,
} from '@/api/soundboard';
import { useAuthStore } from './auth';
import { useVoiceStore } from './voice';

const VOLUME_KEY = 'voice:soundboardVolume';
const MUTE_KEY = 'voice:soundboardMuted';

type SinkIdAudio = HTMLAudioElement & { setSinkId?: (deviceId: string) => Promise<void> };

interface IncomingSoundPacket {
    type: string;
    sound_id?: number;
    name?: string;
    url?: string;
}

export const useSoundboardStore = defineStore('soundboard', () => {
    const sounds = ref<Sound[]>([]);
    const isLoading = ref(false);
    const isUploading = ref(false);
    const hasLoaded = ref(false);
    const volume = ref(1);
    const muted = ref(false);
    const playingId = ref<string | null>(null);

    const activeAudios = new Set<HTMLAudioElement>();

    function effectiveVolume(): number {
        return muted.value ? 0 : volume.value;
    }

    function applyVolumeToActive(): void {
        const v = effectiveVolume();
        for (const audio of activeAudios) audio.volume = v;
    }

    async function loadSettings(): Promise<void> {
        const stored = await window.api.settings.get(VOLUME_KEY);
        if (stored !== null) {
            const parsed = Number(stored);
            if (!Number.isNaN(parsed)) {
                volume.value = Math.min(1, Math.max(0, parsed));
            }
        }
        const storedMute = await window.api.settings.get(MUTE_KEY);
        if (storedMute !== null) {
            muted.value = storedMute === 'true';
        }
    }

    function setVolume(value: number): void {
        volume.value = Math.min(1, Math.max(0, value));
        applyVolumeToActive();
        void window.api.settings.set(VOLUME_KEY, String(volume.value));
    }

    function setMuted(value: boolean): void {
        muted.value = value;
        applyVolumeToActive();
        void window.api.settings.set(MUTE_KEY, String(value));
    }

    function toggleMute(): void {
        setMuted(!muted.value);
    }

    async function fetchSounds(): Promise<void> {
        isLoading.value = true;
        try {
            sounds.value = await listSounds();
            hasLoaded.value = true;
        } finally {
            isLoading.value = false;
        }
    }

    async function ensureLoaded(force = false): Promise<void> {
        if (force || !hasLoaded.value) {
            if (!hasLoaded.value) await loadSettings();
            await fetchSounds();
        }
    }

    async function upload(
        name: string,
        file: Blob,
        fileName: string,
        onProgress?: (progress: number) => void,
    ): Promise<Sound> {
        isUploading.value = true;
        try {
            const sound = await uploadSound(name, file, fileName, onProgress);
            sounds.value = [sound, ...sounds.value];
            return sound;
        } finally {
            isUploading.value = false;
        }
    }

    async function remove(soundId: string): Promise<void> {
        await apiDeleteSound(soundId);
        sounds.value = sounds.value.filter((s) => s.id !== soundId);
    }

    function canDelete(sound: Sound): boolean {
        const auth = useAuthStore();
        const me = auth.user;
        if (!me) return false;
        if (sound.uploadedById && String(me.id) === sound.uploadedById) return true;
        return !!(me.permissions?.canManageServer || me.permissions?.isAdministrator);
    }

    async function trigger(soundId: string): Promise<void> {
        const voice = useVoiceStore();
        const channel = voice.currentChannel;
        if (!channel) return;
        await apiPlaySound(channel.id, soundId);
    }

    function handleIncoming(payload: Uint8Array): void {
        let packet: IncomingSoundPacket;
        try {
            packet = JSON.parse(new TextDecoder().decode(payload)) as IncomingSoundPacket;
        } catch {
            return;
        }
        if (packet.type !== 'play_sound' || !packet.url) return;

        void playClip(packet.url, packet.sound_id != null ? String(packet.sound_id) : null);
    }

    async function playClip(url: string, soundId: string | null): Promise<void> {
        const voice = useVoiceStore();
        if (voice.isSoundMuted) return;

        const audio = new Audio(url) as SinkIdAudio;
        audio.volume = effectiveVolume();

        const deviceId = voice.selectedSpeakerDeviceId;
        if (deviceId && typeof audio.setSinkId === 'function') {
            try {
                await audio.setSinkId(deviceId);
            } catch {
                // Fall back to the default output device.
            }
        }

        activeAudios.add(audio);
        playingId.value = soundId;

        const cleanup = (): void => {
            activeAudios.delete(audio);
            if (playingId.value === soundId) playingId.value = null;
        };
        audio.addEventListener('ended', cleanup, { once: true });
        audio.addEventListener('error', cleanup, { once: true });

        try {
            await audio.play();
        } catch {
            cleanup();
        }
    }

    return {
        sounds,
        isLoading,
        isUploading,
        volume: computed(() => volume.value),
        muted: computed(() => muted.value),
        playingId,
        loadSettings,
        setVolume,
        setMuted,
        toggleMute,
        fetchSounds,
        ensureLoaded,
        upload,
        remove,
        canDelete,
        trigger,
        handleIncoming,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useSoundboardStore, import.meta.hot));
}
