import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
    Room,
    RoomEvent,
    RemoteParticipant,
    type RemoteTrackPublication,
    ConnectionState,
    createLocalAudioTrack,
} from 'livekit-client';
import api from '@/lib/api';
import { playPttActivateSound, playPttDeactivateSound } from '@/lib/ptt-sounds';

export interface VoiceParticipant {
    id: string | number;
    username: string;
    displayName: string;
    isSpeaking: boolean;
    isMuted: boolean;
}

interface VoiceChannel {
    id: number;
    name: string;
}

export const useVoiceStore = defineStore('voice', () => {
    const currentChannel = ref<VoiceChannel | null>(null);
    const isMicMuted = ref(false);
    const isSoundMuted = ref(false);
    const currentParticipants = ref<VoiceParticipant[]>([]);
    const channelParticipantsMap = ref<Map<number, VoiceParticipant[]>>(new Map());

    const pttEnabled = ref(false);
    const pttKey = ref<string | null>(null);
    const pttKeycode = ref<number | null>(null);
    const pttModifiers = ref<{ ctrl: boolean; shift: boolean; alt: boolean; meta: boolean }>({
        ctrl: false,
        shift: false,
        alt: false,
        meta: false,
    });
    const pttSoundEnabled = ref(true);
    const selectedMicDeviceId = ref<string>('default');
    const availableMics = ref<MediaDeviceInfo[]>([]);

    let pttActive = false;

    async function loadSettings(): Promise<void> {
        const [enabled, key, keycode, modifiers, sound, micId] = await Promise.all([
            window.api.settings.get('voice:pttEnabled'),
            window.api.settings.get('voice:pttKey'),
            window.api.settings.get('voice:pttKeycode'),
            window.api.settings.get('voice:pttModifiers'),
            window.api.settings.get('voice:pttSoundEnabled'),
            window.api.settings.get('voice:micDeviceId'),
        ]);

        pttEnabled.value = enabled === 'true';
        pttKey.value = key;
        pttKeycode.value = keycode ? Number(keycode) : null;
        if (modifiers) {
            try {
                pttModifiers.value = JSON.parse(modifiers);
            } catch {
                /* keep defaults */
            }
        }
        pttSoundEnabled.value = sound !== 'false';
        selectedMicDeviceId.value = micId ?? 'default';
    }

    let room: Room | null = null;

    const isConnected = computed(() => currentChannel.value !== null);

    function getChannelParticipants(channelId: number): VoiceParticipant[] {
        return channelParticipantsMap.value.get(channelId) ?? [];
    }

    async function fetchVoiceParticipants(): Promise<void> {
        try {
            const response = await api.get('/voice/participants');
            const data: Record<
                string,
                Array<{ id: number; username: string; display_name: string; avatar_path: string | null }>
            > = response.data ?? {};

            for (const [channelIdStr, participants] of Object.entries(data)) {
                const channelId = Number(channelIdStr);
                const mapped: VoiceParticipant[] = participants.map((p) => ({
                    id: p.id,
                    username: p.username,
                    displayName: p.display_name,
                    isSpeaking: false,
                    isMuted: false,
                }));
                channelParticipantsMap.value.set(channelId, mapped);
            }
        } catch (error) {
            console.error('Failed to fetch voice participants:', error);
        }
    }

    function participantFromRemote(p: RemoteParticipant): VoiceParticipant {
        return {
            id: p.identity,
            username: p.identity,
            displayName: p.name || p.identity,
            isSpeaking: p.isSpeaking,
            isMuted: !p.isMicrophoneEnabled,
        };
    }

    function refreshParticipants(): void {
        if (!room) return;
        const list: VoiceParticipant[] = [];

        const local = room.localParticipant;
        list.push({
            id: local.identity,
            username: local.identity,
            displayName: local.name || local.identity,
            isSpeaking: local.isSpeaking,
            isMuted: isMicMuted.value,
        });

        room.remoteParticipants.forEach((p) => {
            list.push(participantFromRemote(p));
        });

        currentParticipants.value = list;

        if (currentChannel.value) {
            channelParticipantsMap.value.set(currentChannel.value.id, [...list]);
        }
    }

    function wireRoomEvents(r: Room): void {
        r.on(RoomEvent.ParticipantConnected, () => refreshParticipants());
        r.on(RoomEvent.ParticipantDisconnected, () => refreshParticipants());
        r.on(RoomEvent.TrackSubscribed, () => refreshParticipants());
        r.on(RoomEvent.TrackUnsubscribed, () => refreshParticipants());
        r.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            const speakerIds = new Set(speakers.map((s) => s.identity));
            currentParticipants.value = currentParticipants.value.map((p) => ({
                ...p,
                isSpeaking: speakerIds.has(String(p.id)),
            }));
        });
        r.on(RoomEvent.TrackMuted, () => refreshParticipants());
        r.on(RoomEvent.TrackUnmuted, () => refreshParticipants());

        r.on(RoomEvent.Disconnected, () => {
            if (room === r) {
                if (currentChannel.value) {
                    channelParticipantsMap.value.delete(currentChannel.value.id);
                }
                currentChannel.value = null;
                currentParticipants.value = [];
                room = null;
            }
        });
    }

    let isJoining = false;

    async function joinChannel(channelId: number, channelName: string) {
        if (isJoining) return;
        isJoining = true;

        try {
            if (room && room.state === ConnectionState.Connected) {
                await leaveChannel();
            }

            const { data } = await api.post(`/channels/${channelId}/voice/join`);
            const { token, url } = data;

            room = new Room();
            wireRoomEvents(room);

            await room.connect(url, token);

            try {
                const deviceId =
                    selectedMicDeviceId.value && selectedMicDeviceId.value !== 'default'
                        ? selectedMicDeviceId.value
                        : undefined;
                const micTrack = await createLocalAudioTrack({ deviceId });
                if (room) await room.localParticipant.publishTrack(micTrack);
            } catch (micErr) {
                console.warn('[Voice] Selected mic unavailable, falling back to default:', micErr);
                try {
                    const fallbackTrack = await createLocalAudioTrack();
                    if (room) await room.localParticipant.publishTrack(fallbackTrack);
                } catch (fallbackErr) {
                    console.warn('[Voice] No microphone available — joining without mic:', fallbackErr);
                }
            }

            if (room && pttEnabled.value) {
                await room.localParticipant.setMicrophoneEnabled(false);
            }

            currentChannel.value = { id: channelId, name: channelName };
            refreshParticipants();
            console.log(`[Voice] Connected to ${channelName} via LiveKit`);
        } catch (err) {
            console.error('[Voice] Failed to join channel:', err);
            room = null;
            throw err;
        } finally {
            isJoining = false;
        }
    }

    async function leaveChannel() {
        const oldRoom = room;

        room = null;
        pttActive = false;

        if (oldRoom) {
            if (currentChannel.value) {
                api.delete(`/channels/${currentChannel.value.id}/voice/membership`).catch(() => {});
            }
            oldRoom.disconnect();
        }
        if (currentChannel.value) {
            channelParticipantsMap.value.delete(currentChannel.value.id);
        }
        currentChannel.value = null;
        currentParticipants.value = [];
        isMicMuted.value = false;
        isSoundMuted.value = false;
    }

    async function toggleMic() {
        isMicMuted.value = !isMicMuted.value;
        if (room) {
            if (isMicMuted.value) {
                await room.localParticipant.setMicrophoneEnabled(false);
            } else if (!pttEnabled.value || pttActive) {
                await room.localParticipant.setMicrophoneEnabled(true);
            }

            refreshParticipants();
        }
    }

    async function toggleSound() {
        isSoundMuted.value = !isSoundMuted.value;
        if (room) {
            room.remoteParticipants.forEach((p) => {
                p.audioTrackPublications.forEach((pub: RemoteTrackPublication) => {
                    if (pub.track) {
                        pub.track.mediaStreamTrack.enabled = !isSoundMuted.value;
                    }
                });
            });
        }
    }

    async function refreshAvailableMics() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            availableMics.value = devices.filter((d) => d.kind === 'audioinput');
        } catch {
            availableMics.value = [];
        }
    }

    async function setMicDevice(deviceId: string) {
        selectedMicDeviceId.value = deviceId;
        window.api.settings.set('voice:micDeviceId', deviceId);

        if (room && room.state === ConnectionState.Connected) {
            await room.switchActiveDevice('audioinput', deviceId);
        }
    }

    function setPttEnabled(enabled: boolean) {
        pttEnabled.value = enabled;
        window.api.settings.set('voice:pttEnabled', String(enabled));
        syncPttConfig();
    }

    function setPttKey(
        displayName: string | null,
        keycode: number | null = null,
        modifiers?: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean },
    ) {
        pttKey.value = displayName;
        pttKeycode.value = keycode;
        if (modifiers) pttModifiers.value = modifiers;

        if (displayName) {
            window.api.settings.set('voice:pttKey', displayName);
        } else {
            window.api.settings.set('voice:pttKey', '');
        }
        if (keycode !== null) {
            window.api.settings.set('voice:pttKeycode', String(keycode));
        } else {
            window.api.settings.set('voice:pttKeycode', '');
        }
        window.api.settings.set('voice:pttModifiers', JSON.stringify(pttModifiers.value));
        syncPttConfig();
    }

    function setPttSoundEnabled(enabled: boolean) {
        pttSoundEnabled.value = enabled;
        window.api.settings.set('voice:pttSoundEnabled', String(enabled));
    }

    function syncPttConfig() {
        window.api.ptt.configure({
            keycode: pttKeycode.value,
            ctrl: pttModifiers.value.ctrl,
            shift: pttModifiers.value.shift,
            alt: pttModifiers.value.alt,
            meta: pttModifiers.value.meta,
            enabled: pttEnabled.value,
        });
    }

    function handlePttActivated() {
        if (!room || !isConnected.value) return;
        pttActive = true;

        if (!isMicMuted.value) {
            room.localParticipant.setMicrophoneEnabled(true);
            refreshParticipants();
            if (pttSoundEnabled.value) playPttActivateSound();
        }
    }

    function handlePttDeactivated() {
        if (!room || !isConnected.value) return;
        pttActive = false;

        if (pttEnabled.value) {
            room.localParticipant.setMicrophoneEnabled(false);
            refreshParticipants();
            if (pttSoundEnabled.value) playPttDeactivateSound();
        }
    }

    function initPttListeners() {
        window.api.ptt.onActivated(handlePttActivated);
        window.api.ptt.onDeactivated(handlePttDeactivated);

        syncPttConfig();
    }

    function cleanupPttListeners() {
        window.api.ptt.removeAllListeners();
    }

    return {
        currentChannel,
        isMicMuted,
        isSoundMuted,
        currentParticipants,
        isConnected,
        pttEnabled,
        pttKey,
        pttKeycode,
        pttModifiers,
        pttSoundEnabled,
        selectedMicDeviceId,
        availableMics,
        getChannelParticipants,
        loadSettings,
        fetchVoiceParticipants,
        joinChannel,
        leaveChannel,
        toggleMic,
        toggleSound,
        refreshAvailableMics,
        setMicDevice,
        setPttEnabled,
        setPttKey,
        setPttSoundEnabled,
        syncPttConfig,
        initPttListeners,
        cleanupPttListeners,
    };
});
