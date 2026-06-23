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
    /** Volume applied to locally-played clips, 0..1. */
    const volume = ref(1);
    /** Id of the sound currently playing locally, for UI feedback. */
    const playingId = ref<string | null>(null);

    // Keep references to in-flight audio elements so they are not garbage
    // collected mid-playback.
    const activeAudios = new Set<HTMLAudioElement>();

    async function loadSettings(): Promise<void> {
        const stored = await window.api.settings.get(VOLUME_KEY);
        if (stored !== null) {
            const parsed = Number(stored);
            if (!Number.isNaN(parsed)) {
                volume.value = Math.min(1, Math.max(0, parsed));
            }
        }
    }

    function setVolume(value: number): void {
        volume.value = Math.min(1, Math.max(0, value));
        void window.api.settings.set(VOLUME_KEY, String(volume.value));
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

    /** Fetch sounds once; subsequent calls are no-ops unless forced. */
    async function ensureLoaded(force = false): Promise<void> {
        if (force || !hasLoaded.value) {
            // Load the persisted volume alongside the first fetch.
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

    /** Whether the current user may delete the given sound. */
    function canDelete(sound: Sound): boolean {
        const auth = useAuthStore();
        const me = auth.user;
        if (!me) return false;
        if (sound.uploadedById && String(me.id) === sound.uploadedById) return true;
        return !!(me.permissions?.canManageServer || me.permissions?.isAdministrator);
    }

    /**
     * Trigger a sound for everyone in the current voice channel. Playback for
     * all clients (including this one) happens via the round-tripped LiveKit
     * data packet, so we do not play optimistically here.
     */
    async function trigger(soundId: string): Promise<void> {
        const voice = useVoiceStore();
        const channel = voice.currentChannel;
        if (!channel) return;
        await apiPlaySound(channel.id, soundId);
    }

    /**
     * Handle an inbound LiveKit data packet. If it is a soundboard trigger and
     * the local user is not deafened, play the clip through the selected output.
     */
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
        // Deafened users hear nothing — mirror how remote voice is silenced.
        if (voice.isSoundMuted) return;

        const audio = new Audio(url) as SinkIdAudio;
        audio.volume = volume.value;

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
        playingId,
        loadSettings,
        setVolume,
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
