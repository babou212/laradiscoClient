import type { LocalAudioTrack, LocalVideoTrack, RemoteParticipant, VideoCodec, VideoEncoding } from 'livekit-client';
import {
    AudioPresets,
    ConnectionQuality,
    ExternalE2EEKeyProvider,
    Room,
    RoomEvent,
    ConnectionState,
    Track,
    TrackEvent,
    VideoPreset,
    VideoPresets,
} from 'livekit-client';
import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useUsersStore } from './users';
import { getVoiceParticipants, joinVoiceChannel, leaveVoiceMembership } from '@/api/voice';
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
    const isReconnecting = ref(false);
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
    const selectedMicDeviceId = ref<string | undefined>(undefined);
    const availableMics = ref<MediaDeviceInfo[]>([]);
    const isAudioPlaybackBlocked = ref(false);

    const noiseSuppression = ref(true);
    const echoCancellation = ref(true);
    const autoGainControl = ref(true);

    const isScreenSharing = ref(false);
    const screenShareQuality = ref<ScreenShareQualityPreset>('high');
    const screenShareParticipants = ref<ScreenShareParticipant[]>([]);
    const activeScreenShareView = ref<string | null>(null);
    const screenShareViewMode = ref<ScreenShareViewMode>('pip');
    const screenShareAudioMuted = ref(true);
    let screenShareTracks: Array<LocalVideoTrack | LocalAudioTrack> = [];
    let isRestartingScreenShare = false;

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
        selectedMicDeviceId.value = micId && micId !== 'default' ? micId : undefined;
        noiseSuppression.value = ns !== 'false';
        echoCancellation.value = ec !== 'false';
        autoGainControl.value = agc !== 'false';
        if (ssQuality && ssQuality in SCREEN_SHARE_PRESETS) {
            screenShareQuality.value = ssQuality as ScreenShareQualityPreset;
        }
    }

    let room: Room | null = null;

    const isConnected = computed(() => currentChannel.value !== null);

    function buildAudioCaptureDefaults() {
        return {
            deviceId: selectedMicDeviceId.value,
            noiseSuppression: noiseSuppression.value,
            echoCancellation: echoCancellation.value,
            autoGainControl: autoGainControl.value,
        };
    }

    const micPublishOptions = {
        audioPreset: AudioPresets.speech,
        dtx: true,
        red: true,
    } as const;

    function getChannelParticipants(channelId: number): VoiceParticipant[] {
        return channelParticipantsMap.value.get(channelId) ?? [];
    }

    async function fetchVoiceParticipants(): Promise<void> {
        try {
            const data = await getVoiceParticipants();

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

                const usersStore = useUsersStore();
                usersStore.hydrateFromUsers(
                    participants.map((p) => ({
                        id: String(p.id),
                        username: p.username,
                        display_name: p.display_name,
                        avatar_urls: p.avatar_urls,
                    })),
                );
            }
        } catch (error) {
            console.error('Failed to fetch voice participants:', error);
        }
    }

    let subscribedChannelIds: (string | number)[] = [];

    function subscribeToVoiceChannels(voiceChannelIds: (string | number)[]): void {
        unsubscribeFromVoiceChannels();
        const echo = getEcho();

        for (const chId of voiceChannelIds) {
            const channelId = Number(chId);
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
            const usersStore = useUsersStore();
            const stored = usersStore.get(String(numericId));
            if (stored?.avatar_urls) return stored.avatar_urls;
        }
        return null;
    }

    function participantFromRemote(p: RemoteParticipant): VoiceParticipant {
        return {
            id: p.identity,
            username: p.identity,
            displayName: p.name || p.identity,
            isSpeaking: p.isSpeaking,
            isMuted: p.getTrackPublication(Track.Source.Microphone)?.isMuted ?? false,
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

    function updateParticipantTracks(identity: string): void {
        if (!room) return;
        const localId = room.localParticipant.identity;
        const idx = currentParticipants.value.findIndex((p) => String(p.id) === identity);
        if (idx === -1) {
            refreshParticipants();
            return;
        }

        if (identity === localId) {
            currentParticipants.value[idx] = {
                ...currentParticipants.value[idx],
                isMuted: isMicMuted.value,
                isScreenSharing: isScreenSharing.value,
            };
        } else {
            const remote = room.remoteParticipants.get(identity);
            if (remote) {
                currentParticipants.value[idx] = participantFromRemote(remote);
            }
        }
        currentParticipants.value = [...currentParticipants.value];

        if (currentChannel.value) {
            channelParticipantsMap.value.set(currentChannel.value.id, [...currentParticipants.value]);
        }
    }

    function wireRoomEvents(r: Room): void {
        r.on(RoomEvent.ParticipantConnected, (participant) => {
            if (isSoundMuted.value) participant.setVolume(0);
            refreshParticipants();
        });
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
            updateParticipantTracks(participant.identity);
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
            updateParticipantTracks(participant.identity);
        });
        r.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            const speakerIds = new Set(speakers.map((s) => s.identity));
            const localId = r.localParticipant.identity;
            currentParticipants.value = currentParticipants.value.map((p) => ({
                ...p,
                isSpeaking: String(p.id) === localId ? speakerIds.has(localId) : speakerIds.has(String(p.id)),
            }));
        });
        r.on(RoomEvent.MediaDevicesChanged, () => {
            void refreshAvailableMics();
        });
        r.on(RoomEvent.AudioPlaybackStatusChanged, () => {
            isAudioPlaybackBlocked.value = !r.canPlaybackAudio;
        });
        r.on(RoomEvent.TrackMuted, (_pub, participant) => updateParticipantTracks(participant.identity));
        r.on(RoomEvent.TrackUnmuted, (_pub, participant) => updateParticipantTracks(participant.identity));
        r.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
            if (participant.identity === r.localParticipant.identity) {
                connectionQuality.value = quality;
            }
        });

        r.on(RoomEvent.Reconnecting, () => {
            if (room === r) isReconnecting.value = true;
        });
        r.on(RoomEvent.Reconnected, () => {
            if (room === r) {
                isReconnecting.value = false;
                refreshParticipants();
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
                isReconnecting.value = false;
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

            const { token, url, e2ee_key } = await joinVoiceChannel(channelId);

            const keyProvider = new ExternalE2EEKeyProvider();

            room = new Room({
                adaptiveStream: true,
                dynacast: true,
                e2ee: {
                    keyProvider,
                    worker: new Worker(new URL('livekit-client/e2ee-worker', import.meta.url)),
                },
                audioCaptureDefaults: buildAudioCaptureDefaults(),
                publishDefaults: {
                    videoCodec: 'vp9' as VideoCodec,
                    backupCodec: { codec: 'vp8' },
                    videoEncoding: VideoPresets.h720.encoding,
                    videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
                    screenShareEncoding: { maxBitrate: 3_000_000, maxFramerate: 30 },
                },
            });
            wireRoomEvents(room);

            await keyProvider.setKey(e2ee_key);
            await room.connect(url, token);

            try {
                await room.localParticipant.setMicrophoneEnabled(
                    !pttEnabled.value,
                    buildAudioCaptureDefaults(),
                    micPublishOptions,
                );
            } catch (micErr) {
                console.warn('[Voice] Selected mic unavailable, retrying without deviceId:', micErr);
                try {
                    await room.localParticipant.setMicrophoneEnabled(
                        !pttEnabled.value,
                        { ...buildAudioCaptureDefaults(), deviceId: undefined },
                        micPublishOptions,
                    );
                } catch (fallbackErr) {
                    console.warn('[Voice] No microphone available — joining without mic:', fallbackErr);
                }
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
        for (const t of screenShareTracks) {
            try {
                t.stop();
            } catch {
                // ignore
            }
        }
        screenShareTracks = [];
        isScreenSharing.value = false;
        screenShareParticipants.value = [];
        activeScreenShareView.value = null;
    }

    async function startScreenShare(): Promise<void> {
        if (!room || room.state !== ConnectionState.Connected) return;
        if (isScreenSharing.value) return;

        const preset = SCREEN_SHARE_PRESETS[screenShareQuality.value];
        const resolution =
            preset.width > 0
                ? { width: preset.width, height: preset.height, frameRate: preset.frameRate }
                : { width: 3840, height: 2160, frameRate: preset.frameRate };

        try {
            const tracks = await room.localParticipant.createScreenTracks({
                audio: true,
                resolution,
            });

            const localVideoTrack = tracks.find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined;
            const localAudioTrack = tracks.find((t) => t.kind === Track.Kind.Audio) as LocalAudioTrack | undefined;

            if (localVideoTrack) {
                await room.localParticipant.publishTrack(localVideoTrack, {
                    source: Track.Source.ScreenShare,
                    name: 'screen',
                    videoCodec: 'vp9' as VideoCodec,
                    videoEncoding: preset.encoding,
                    backupCodec: { codec: 'vp8' },
                    videoSimulcastLayers: preset.simulcastLayers,
                    simulcast: true,
                    scalabilityMode: 'L3T3_KEY',
                });
                localVideoTrack.on(TrackEvent.Ended, () => {
                    void stopScreenShare();
                });
            }

            if (localAudioTrack) {
                await room.localParticipant.publishTrack(localAudioTrack, {
                    source: Track.Source.ScreenShareAudio,
                    name: 'screen-audio',
                    audioPreset: AudioPresets.musicHighQualityStereo,
                    dtx: false,
                    red: true,
                });
            }

            screenShareTracks = tracks as Array<LocalVideoTrack | LocalAudioTrack>;
            isScreenSharing.value = true;

            const localIdentity = room.localParticipant.identity;
            screenShareParticipants.value = [
                ...screenShareParticipants.value,
                {
                    identity: localIdentity,
                    displayName: room.localParticipant.name || localIdentity,
                    videoTrack: { mediaStreamTrack: localVideoTrack!.mediaStreamTrack },
                    audioTrack: localAudioTrack ? { mediaStreamTrack: localAudioTrack.mediaStreamTrack } : null,
                },
            ];

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

        for (const track of screenShareTracks) {
            try {
                await room.localParticipant.unpublishTrack(track, true);
            } catch (err) {
                console.warn('[Voice] Failed to unpublish screen share track:', err);
            }
        }
        screenShareTracks = [];
        isScreenSharing.value = false;

        const localIdentity = room.localParticipant.identity;
        screenShareParticipants.value = screenShareParticipants.value.filter((s) => s.identity !== localIdentity);
        if (activeScreenShareView.value === localIdentity) {
            activeScreenShareView.value = screenShareParticipants.value[0]?.identity ?? null;
        }

        refreshParticipants();
        console.log('[Voice] Screen share stopped');
    }

    async function setScreenShareQuality(preset: ScreenShareQualityPreset): Promise<void> {
        screenShareQuality.value = preset;
        window.api.settings.set('voice:screenShareQuality', preset);

        if (isScreenSharing.value && !isRestartingScreenShare) {
            isRestartingScreenShare = true;
            try {
                await stopScreenShare();
                await startScreenShare();
            } finally {
                isRestartingScreenShare = false;
            }
        }
    }

    async function leaveChannel() {
        const oldRoom = room;

        room = null;
        pttActive = false;
        cleanupScreenShare();

        if (oldRoom) {
            if (currentChannel.value) {
                leaveVoiceMembership(currentChannel.value.id).catch(() => {});
            }
            try {
                await oldRoom.disconnect();
            } catch (err) {
                console.warn('[Voice] Error during disconnect:', err);
            }
        }
        if (currentChannel.value) {
            channelParticipantsMap.value.delete(currentChannel.value.id);
        }
        currentChannel.value = null;
        currentParticipants.value = [];
        isMicMuted.value = false;
        isSoundMuted.value = false;
        connectionQuality.value = ConnectionQuality.Unknown;
        isAudioPlaybackBlocked.value = false;
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
        if (!room) return;
        const volume = isSoundMuted.value ? 0 : 1;
        room.remoteParticipants.forEach((p) => {
            p.setVolume(volume);
        });
    }

    async function refreshAvailableMics() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            availableMics.value = devices.filter((d) => d.kind === 'audioinput');

            const selected = selectedMicDeviceId.value;
            if (selected && !availableMics.value.some((d) => d.deviceId === selected)) {
                selectedMicDeviceId.value = undefined;
                window.api.settings.set('voice:micDeviceId', '');
                if (room && room.state === ConnectionState.Connected) {
                    void reapplyAudioProcessing();
                }
            }
        } catch {
            availableMics.value = [];
        }
    }

    async function setMicDevice(deviceId: string | undefined) {
        selectedMicDeviceId.value = deviceId;
        window.api.settings.set('voice:micDeviceId', deviceId ?? '');

        if (room && room.state === ConnectionState.Connected && deviceId) {
            await room.switchActiveDevice('audioinput', deviceId);
        } else if (room && room.state === ConnectionState.Connected) {
            void reapplyAudioProcessing();
        }
    }

    async function enableAudioPlayback(): Promise<void> {
        if (!room) return;
        try {
            await room.startAudio();
            isAudioPlaybackBlocked.value = !room.canPlaybackAudio;
        } catch (err) {
            console.warn('[Voice] Failed to start audio playback:', err);
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

        const defaults = buildAudioCaptureDefaults();
        if (room.options) {
            room.options.audioCaptureDefaults = { ...room.options.audioCaptureDefaults, ...defaults };
        }

        const shouldEnable = !isMicMuted.value && (!pttEnabled.value || pttActive);
        try {
            await room.localParticipant.setMicrophoneEnabled(false);
            await room.localParticipant.setMicrophoneEnabled(shouldEnable, defaults, micPublishOptions);
        } catch (err) {
            console.warn('[Voice] Failed to re-acquire mic with new constraints:', err);
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
        selectedMicDeviceId.value = undefined;
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
        isReconnecting,
        currentParticipants,
        isConnected,
        pttEnabled,
        pttKey,
        pttKeycode,
        pttModifiers,
        pttSoundEnabled,
        selectedMicDeviceId,
        availableMics,
        isAudioPlaybackBlocked,
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
        enableAudioPlayback,
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
