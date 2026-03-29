import type { RemoteParticipant, VideoCodec, VideoEncoding } from 'livekit-client';
import {
    AudioPresets,
    ConnectionQuality,
    ExternalE2EEKeyProvider,
    Room,
    RoomEvent,
    type RemoteTrackPublication,
    ConnectionState,
    Track,
    VideoPreset,
    VideoPresets,
    createLocalAudioTrack,
} from 'livekit-client';
import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useAvatarStore } from './avatar';
import api from '@/lib/api';
import { getEcho } from '@/lib/echo';
import { playPttActivateSound, playPttDeactivateSound } from '@/lib/ptt-sounds';
import type { AvatarUrls } from '@/types/chat';

export interface VoiceParticipant {
    id: string | number;
    username: string;
    displayName: string;
    isSpeaking: boolean;
    isMuted: boolean;
    isScreenSharing: boolean;
    avatarUrls: AvatarUrls | null;
}

export interface ScreenShareTrack {
    mediaStreamTrack: MediaStreamTrack;
}

export interface ScreenShareParticipant {
    identity: string;
    displayName: string;
    videoTrack: ScreenShareTrack;
    audioTrack: ScreenShareTrack | null;
}

export type ScreenShareQualityPreset = 'low' | 'medium' | 'high' | 'source';

export type ScreenShareViewMode = 'pip' | 'channel' | 'fullscreen';

export const SCREEN_SHARE_PRESETS: Record<
    ScreenShareQualityPreset,
    {
        width: number;
        height: number;
        frameRate: number;
        encoding: VideoEncoding;
        simulcastLayers: VideoPreset[];
    }
> = {
    low: {
        width: 1280,
        height: 720,
        frameRate: 30,
        encoding: VideoPresets.h720.encoding,
        simulcastLayers: [VideoPresets.h360],
    },
    medium: {
        width: 1920,
        height: 1080,
        frameRate: 30,
        encoding: VideoPresets.h1080.encoding,
        simulcastLayers: [VideoPresets.h720, VideoPresets.h360],
    },
    high: {
        width: 1920,
        height: 1080,
        frameRate: 60,
        encoding: { maxBitrate: 3_000_000, maxFramerate: 60 },
        simulcastLayers: [new VideoPreset(1280, 720, 1_500_000, 60), new VideoPreset(640, 360, 600_000, 30)],
    },
    source: {
        width: 0,
        height: 0,
        frameRate: 60,
        encoding: { maxBitrate: 3_000_000, maxFramerate: 60 },
        simulcastLayers: [new VideoPreset(1920, 1080, 1_500_000, 60), new VideoPreset(1280, 720, 800_000, 30)],
    },
};

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

    const connectionQuality = ref<ConnectionQuality>(ConnectionQuality.Unknown);

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

    const noiseSuppression = ref(true);
    const echoCancellation = ref(true);
    const autoGainControl = ref(true);

    const isScreenSharing = ref(false);
    const screenShareQuality = ref<ScreenShareQualityPreset>('high');
    const screenShareParticipants = ref<ScreenShareParticipant[]>([]);
    const activeScreenShareView = ref<string | null>(null);
    const screenShareViewMode = ref<ScreenShareViewMode>('pip');
    const screenShareAudioMuted = ref(true);
    let screenShareStream: MediaStream | null = null;

    let pttActive = false;

    async function loadSettings(): Promise<void> {
        const [enabled, key, keycode, modifiers, sound, micId, ns, ec, agc, ssQuality] = await Promise.all([
            window.api.settings.get('voice:pttEnabled'),
            window.api.settings.get('voice:pttKey'),
            window.api.settings.get('voice:pttKeycode'),
            window.api.settings.get('voice:pttModifiers'),
            window.api.settings.get('voice:pttSoundEnabled'),
            window.api.settings.get('voice:micDeviceId'),
            window.api.settings.get('voice:noiseSuppression'),
            window.api.settings.get('voice:echoCancellation'),
            window.api.settings.get('voice:autoGainControl'),
            window.api.settings.get('voice:screenShareQuality'),
        ]);

        pttEnabled.value = enabled === 'true';
        pttKey.value = key;
        pttKeycode.value = keycode ? Number(keycode) : null;
        if (modifiers) {
            try {
                pttModifiers.value = JSON.parse(modifiers);
            } catch (error) {
                console.error(error);
            }
        }
        pttSoundEnabled.value = sound !== 'false';
        selectedMicDeviceId.value = micId ?? 'default';
        noiseSuppression.value = ns !== 'false';
        echoCancellation.value = ec !== 'false';
        autoGainControl.value = agc !== 'false';
        if (ssQuality && ssQuality in SCREEN_SHARE_PRESETS) {
            screenShareQuality.value = ssQuality as ScreenShareQualityPreset;
        }
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
                Array<{
                    id: number;
                    username: string;
                    display_name: string;
                    avatar_urls: { thumb: string; small: string; medium: string; original: string } | null;
                }>
            > = response.data ?? {};

            for (const [channelIdStr, participants] of Object.entries(data)) {
                const channelId = Number(channelIdStr);
                const mapped: VoiceParticipant[] = participants.map((p) => ({
                    id: p.id,
                    username: p.username,
                    displayName: p.display_name,
                    isSpeaking: false,
                    isMuted: false,
                    isScreenSharing: false,
                    avatarUrls: p.avatar_urls ?? null,
                }));
                channelParticipantsMap.value.set(channelId, mapped);

                const avatarStore = useAvatarStore();
                avatarStore.hydrateFromUsers(participants.map((p) => ({ id: p.id, avatar_urls: p.avatar_urls })));
            }
        } catch (error) {
            console.error('Failed to fetch voice participants:', error);
        }
    }

    let subscribedChannelIds: number[] = [];

    function subscribeToVoiceChannels(voiceChannelIds: number[]): void {
        unsubscribeFromVoiceChannels();
        const echo = getEcho();

        for (const channelId of voiceChannelIds) {
            echo.private(`voice.channel.${channelId}`)
                .listen(
                    '.voice.joined',
                    (data: {
                        user: {
                            id: number;
                            username: string;
                            display_name: string;
                            avatar_urls: { thumb: string; small: string; medium: string; original: string } | null;
                        };
                        channel_id: number;
                    }) => {
                        const participants = channelParticipantsMap.value.get(data.channel_id) ?? [];
                        if (!participants.some((p) => p.id === data.user.id)) {
                            channelParticipantsMap.value.set(data.channel_id, [
                                ...participants,
                                {
                                    id: data.user.id,
                                    username: data.user.username,
                                    displayName: data.user.display_name,
                                    isSpeaking: false,
                                    isMuted: false,
                                    isScreenSharing: false,
                                    avatarUrls: data.user.avatar_urls ?? null,
                                },
                            ]);
                        }
                    },
                )
                .listen('.voice.left', (data: { user_id: number; channel_id: number }) => {
                    const participants = channelParticipantsMap.value.get(data.channel_id);
                    if (participants) {
                        const filtered = participants.filter((p) => p.id !== data.user_id);
                        if (filtered.length > 0) {
                            channelParticipantsMap.value.set(data.channel_id, filtered);
                        } else {
                            channelParticipantsMap.value.delete(data.channel_id);
                        }
                    }
                });
        }

        subscribedChannelIds = voiceChannelIds;
    }

    function unsubscribeFromVoiceChannels(): void {
        if (subscribedChannelIds.length === 0) return;
        const echo = getEcho();
        for (const channelId of subscribedChannelIds) {
            echo.leave(`voice.channel.${channelId}`);
        }
        subscribedChannelIds = [];
    }

    function findExistingAvatarUrls(identity: string | number): AvatarUrls | null {
        if (currentChannel.value) {
            const existing = channelParticipantsMap.value.get(currentChannel.value.id);
            const match = existing?.find((p) => String(p.id) === String(identity));
            if (match?.avatarUrls) return match.avatarUrls;
        }
        const numericId = Number(identity);
        if (!isNaN(numericId)) {
            const avatarStore = useAvatarStore();
            const cached = avatarStore.getAvatarUrl(numericId, 'thumb');
            if (cached) {
                const full = avatarStore.cache.get(numericId);
                if (full) return full;
            }
        }
        return null;
    }

    function participantFromRemote(p: RemoteParticipant): VoiceParticipant {
        return {
            id: p.identity,
            username: p.identity,
            displayName: p.name || p.identity,
            isSpeaking: p.isSpeaking,
            isMuted: !p.isMicrophoneEnabled,
            isScreenSharing: p.isScreenShareEnabled,
            avatarUrls: findExistingAvatarUrls(p.identity),
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
            isScreenSharing: isScreenSharing.value,
            avatarUrls: findExistingAvatarUrls(local.identity),
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
        r.on(RoomEvent.ParticipantDisconnected, (participant) => {
            screenShareParticipants.value = screenShareParticipants.value.filter(
                (s) => s.identity !== participant.identity,
            );
            if (activeScreenShareView.value === participant.identity) {
                activeScreenShareView.value = screenShareParticipants.value[0]?.identity ?? null;
            }
            refreshParticipants();
        });
        r.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
            if (track.source === Track.Source.ScreenShare) {
                const wrappedTrack = { mediaStreamTrack: track.mediaStreamTrack };
                const existing = screenShareParticipants.value.find((s) => s.identity === participant.identity);
                if (existing) {
                    existing.videoTrack = wrappedTrack;
                } else {
                    screenShareParticipants.value = [
                        ...screenShareParticipants.value,
                        {
                            identity: participant.identity,
                            displayName: participant.name || participant.identity,
                            videoTrack: wrappedTrack,
                            audioTrack: null,
                        },
                    ];
                }
                if (!activeScreenShareView.value) {
                    activeScreenShareView.value = participant.identity;
                }
            } else if (track.source === Track.Source.ScreenShareAudio) {
                const existing = screenShareParticipants.value.find((s) => s.identity === participant.identity);
                if (existing) {
                    existing.audioTrack = { mediaStreamTrack: track.mediaStreamTrack };
                    screenShareParticipants.value = [...screenShareParticipants.value];
                }
            }
            refreshParticipants();
        });
        r.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
            if (track.source === Track.Source.ScreenShare) {
                screenShareParticipants.value = screenShareParticipants.value.filter(
                    (s) => s.identity !== participant.identity,
                );
                if (activeScreenShareView.value === participant.identity) {
                    activeScreenShareView.value = screenShareParticipants.value[0]?.identity ?? null;
                }
            } else if (track.source === Track.Source.ScreenShareAudio) {
                const existing = screenShareParticipants.value.find((s) => s.identity === participant.identity);
                if (existing) {
                    existing.audioTrack = null;
                    screenShareParticipants.value = [...screenShareParticipants.value];
                }
            }
            refreshParticipants();
        });
        r.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            const speakerIds = new Set(speakers.map((s) => s.identity));
            currentParticipants.value = currentParticipants.value.map((p) => ({
                ...p,
                isSpeaking: speakerIds.has(String(p.id)),
            }));
        });
        r.on(RoomEvent.TrackMuted, () => refreshParticipants());
        r.on(RoomEvent.TrackUnmuted, () => refreshParticipants());
        r.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
            if (participant.identity === r.localParticipant.identity) {
                connectionQuality.value = quality;
            }
        });

        r.on(RoomEvent.Disconnected, () => {
            if (room === r) {
                if (currentChannel.value) {
                    channelParticipantsMap.value.delete(currentChannel.value.id);
                }
                currentChannel.value = null;
                currentParticipants.value = [];
                connectionQuality.value = ConnectionQuality.Unknown;
                cleanupScreenShare();
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
            const { token, url, e2ee_key } = data;

            const keyProvider = new ExternalE2EEKeyProvider();

            room = new Room({
                dynacast: true,
                e2ee: {
                    keyProvider,
                    worker: new Worker(new URL('livekit-client/e2ee-worker', import.meta.url)),
                },
                publishDefaults: {
                    videoCodec: 'vp9' as VideoCodec,
                    backupCodec: { codec: 'vp8' },
                    videoEncoding: VideoPresets.h720.encoding,
                    screenShareEncoding: { maxBitrate: 3_000_000, maxFramerate: 30 },
                },
            });
            wireRoomEvents(room);

            await keyProvider.setKey(e2ee_key);
            await room.connect(url, token);

            try {
                const deviceId =
                    selectedMicDeviceId.value && selectedMicDeviceId.value !== 'default'
                        ? selectedMicDeviceId.value
                        : undefined;
                const micTrack = await createLocalAudioTrack({
                    deviceId,
                    noiseSuppression: noiseSuppression.value,
                    echoCancellation: echoCancellation.value,
                    autoGainControl: autoGainControl.value,
                });
                if (room)
                    await room.localParticipant.publishTrack(micTrack, {
                        audioPreset: AudioPresets.speech,
                        dtx: true,
                        red: true,
                    });
            } catch (micErr) {
                console.warn('[Voice] Selected mic unavailable, falling back to default:', micErr);
                try {
                    const fallbackTrack = await createLocalAudioTrack({
                        noiseSuppression: noiseSuppression.value,
                        echoCancellation: echoCancellation.value,
                        autoGainControl: autoGainControl.value,
                    });
                    if (room)
                        await room.localParticipant.publishTrack(fallbackTrack, {
                            audioPreset: AudioPresets.speech,
                            dtx: true,
                            red: true,
                        });
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

    function cleanupScreenShare(): void {
        if (screenShareStream) {
            screenShareStream.getTracks().forEach((t) => t.stop());
            screenShareStream = null;
        }
        isScreenSharing.value = false;
        screenShareParticipants.value = [];
        activeScreenShareView.value = null;
    }

    async function startScreenShare(): Promise<void> {
        if (!room || room.state !== ConnectionState.Connected) return;
        if (isScreenSharing.value) return;

        const preset = SCREEN_SHARE_PRESETS[screenShareQuality.value];
        const videoConstraints: DisplayMediaStreamOptions['video'] = {};
        if (preset.width > 0) {
            (videoConstraints as MediaTrackConstraints).width = { max: preset.width };
            (videoConstraints as MediaTrackConstraints).height = { max: preset.height };
        }
        (videoConstraints as MediaTrackConstraints).frameRate = { max: preset.frameRate };

        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                audio: true,
                video: videoConstraints,
            });

            screenShareStream = stream;

            const videoTrack = stream.getVideoTracks()[0];
            const audioTrack = stream.getAudioTracks()[0];

            if (videoTrack) {
                await room.localParticipant.publishTrack(videoTrack, {
                    source: Track.Source.ScreenShare,
                    name: 'screen',
                    videoCodec: 'vp9' as VideoCodec,
                    videoEncoding: preset.encoding,
                    backupCodec: { codec: 'vp8' },
                    videoSimulcastLayers: preset.simulcastLayers,
                    simulcast: true,
                    scalabilityMode: 'L3T3_KEY',
                });
            }

            if (audioTrack) {
                await room.localParticipant.publishTrack(audioTrack, {
                    source: Track.Source.ScreenShareAudio,
                    name: 'screen-audio',
                    audioPreset: AudioPresets.musicHighQualityStereo,
                    dtx: false,
                    red: true,
                });
            }

            videoTrack?.addEventListener('ended', () => {
                stopScreenShare();
            });

            isScreenSharing.value = true;

            const localIdentity = room.localParticipant.identity;
            screenShareParticipants.value = [
                ...screenShareParticipants.value,
                {
                    identity: localIdentity,
                    displayName: room.localParticipant.name || localIdentity,
                    videoTrack: { mediaStreamTrack: videoTrack },
                    audioTrack: audioTrack ? { mediaStreamTrack: audioTrack } : null,
                },
            ];
            if (!activeScreenShareView.value) {
                activeScreenShareView.value = localIdentity;
            }

            refreshParticipants();
            console.log('[Voice] Screen share started');
        } catch (err) {
            console.error('[Voice] Failed to start screen share:', err);
        }
    }

    async function stopScreenShare(): Promise<void> {
        if (!room || !isScreenSharing.value) {
            cleanupScreenShare();
            return;
        }

        const pubs = [...room.localParticipant.trackPublications.values()];
        for (const pub of pubs) {
            if (pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) {
                const track = pub.track;
                if (track && track.mediaStreamTrack) {
                    await room.localParticipant.unpublishTrack(track.mediaStreamTrack);
                }
            }
        }

        if (screenShareStream) {
            screenShareStream.getTracks().forEach((t) => t.stop());
            screenShareStream = null;
        }
        isScreenSharing.value = false;

        const localIdentity = room.localParticipant.identity;
        screenShareParticipants.value = screenShareParticipants.value.filter((s) => s.identity !== localIdentity);
        if (activeScreenShareView.value === localIdentity) {
            activeScreenShareView.value = screenShareParticipants.value[0]?.identity ?? null;
        }

        refreshParticipants();
        console.log('[Voice] Screen share stopped');
    }

    function setScreenShareQuality(preset: ScreenShareQualityPreset): void {
        screenShareQuality.value = preset;
        window.api.settings.set('voice:screenShareQuality', preset);
    }

    async function leaveChannel() {
        const oldRoom = room;

        room = null;
        pttActive = false;
        cleanupScreenShare();

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
        connectionQuality.value = ConnectionQuality.Unknown;
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

    function setNoiseSuppression(enabled: boolean) {
        noiseSuppression.value = enabled;
        window.api.settings.set('voice:noiseSuppression', String(enabled));
        reapplyAudioProcessing();
    }

    function setEchoCancellation(enabled: boolean) {
        echoCancellation.value = enabled;
        window.api.settings.set('voice:echoCancellation', String(enabled));
        reapplyAudioProcessing();
    }

    function setAutoGainControl(enabled: boolean) {
        autoGainControl.value = enabled;
        window.api.settings.set('voice:autoGainControl', String(enabled));
        reapplyAudioProcessing();
    }

    async function reapplyAudioProcessing() {
        if (!room || room.state !== ConnectionState.Connected) return;

        const localPubs = room.localParticipant.audioTrackPublications;
        const localPub = [...localPubs.values()].find((p) => p.track);
        if (!localPub?.track) return;

        const mediaTrack = localPub.track.mediaStreamTrack;
        try {
            await mediaTrack.applyConstraints({
                noiseSuppression: noiseSuppression.value,
                echoCancellation: echoCancellation.value,
                autoGainControl: autoGainControl.value,
            });
        } catch (err) {
            console.warn('[Voice] Failed to apply audio constraints live, will apply on next connect:', err);
        }
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

    async function $reset(): Promise<void> {
        await leaveChannel();
        cleanupPttListeners();
        unsubscribeFromVoiceChannels();
        channelParticipantsMap.value = new Map();
        pttEnabled.value = false;
        pttKey.value = null;
        pttKeycode.value = null;
        pttModifiers.value = { ctrl: false, shift: false, alt: false, meta: false };
        pttSoundEnabled.value = true;
        selectedMicDeviceId.value = 'default';
        availableMics.value = [];
        noiseSuppression.value = true;
        echoCancellation.value = true;
        autoGainControl.value = true;
        screenShareQuality.value = 'high';
        screenShareViewMode.value = 'pip';
        screenShareAudioMuted.value = true;
    }

    return {
        currentChannel,
        connectionQuality,
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
        noiseSuppression,
        echoCancellation,
        autoGainControl,
        getChannelParticipants,
        loadSettings,
        fetchVoiceParticipants,
        subscribeToVoiceChannels,
        unsubscribeFromVoiceChannels,
        joinChannel,
        leaveChannel,
        toggleMic,
        toggleSound,
        refreshAvailableMics,
        setMicDevice,
        setNoiseSuppression,
        setEchoCancellation,
        setAutoGainControl,
        setPttEnabled,
        setPttKey,
        setPttSoundEnabled,
        syncPttConfig,
        initPttListeners,
        cleanupPttListeners,
        isScreenSharing,
        screenShareQuality,
        screenShareParticipants,
        activeScreenShareView,
        screenShareViewMode,
        screenShareAudioMuted,
        startScreenShare,
        stopScreenShare,
        setScreenShareQuality,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useVoiceStore, import.meta.hot));
}
