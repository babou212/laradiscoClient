import type {
    LocalAudioTrack,
    LocalVideoTrack,
    RemoteParticipant,
    RemoteTrackPublication,
    VideoCodec,
    VideoEncoding,
} from 'livekit-client';
import {
    AudioPresets,
    ConnectionQuality,
    createLocalAudioTrack,
    Room,
    RoomEvent,
    ConnectionState,
    Track,
    TrackEvent,
    VideoPresets,
} from 'livekit-client';
import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import {
    getVoiceChannelKey,
    getVoiceParticipants,
    joinVoiceChannel,
    leaveVoiceMembership,
    parkAfk,
    unparkAfk,
} from '@/api/voice';
import { IndexedKeyProvider } from '@/lib/voice-key-provider';
import { getEcho } from '@/lib/echo';
import { playPttActivateSound, playPttDeactivateSound } from '@/lib/ptt-sounds';
import type { AvatarUrls } from '@/types/chat';
import type { PttBinding } from '@/types/ptt';
import { useAuthStore } from './auth';
import { useSoundboardStore } from './soundboard';
import { useUsersStore } from './users';

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
    }
> = {
    low: {
        width: 1280,
        height: 720,
        frameRate: 30,
        encoding: VideoPresets.h720.encoding,
    },
    medium: {
        width: 1920,
        height: 1080,
        frameRate: 30,
        encoding: VideoPresets.h1080.encoding,
    },
    high: {
        width: 1920,
        height: 1080,
        frameRate: 30,
        encoding: { maxBitrate: 4_500_000, maxFramerate: 30 },
    },
    source: {
        width: 0,
        height: 0,
        frameRate: 30,
        encoding: { maxBitrate: 8_000_000, maxFramerate: 30 },
    },
};

interface VoiceChannel {
    id: number;
    name: string;
}

const MUTED_ATTRIBUTE = 'micMuted';

const PTT_DATA_TOPIC = 'ptt';

function parsePttBinding(
    stored: string | null,
    legacyKeycode: string | null,
    legacyModifiers: string | null,
): PttBinding | null {
    if (stored) {
        try {
            const parsed = JSON.parse(stored) as PttBinding;
            if (parsed?.device === 'keyboard' || parsed?.device === 'mouse') return parsed;
        } catch {
            // fall through to legacy migration
        }
    }
    if (legacyKeycode) {
        let modifiers = { ctrl: false, shift: false, alt: false, meta: false };
        if (legacyModifiers) {
            try {
                modifiers = { ...modifiers, ...JSON.parse(legacyModifiers) };
            } catch {
                // ignore malformed stored modifiers
            }
        }
        return { device: 'keyboard', keycode: Number(legacyKeycode), modifiers };
    }
    return null;
}

export const useVoiceStore = defineStore('voice', () => {
    const currentChannel = ref<VoiceChannel | null>(null);
    const isMicMuted = ref(false);
    const isSoundMuted = ref(false);
    const isReconnecting = ref(false);
    const currentParticipants = ref<VoiceParticipant[]>([]);
    const channelParticipantsMap = ref<Map<number, VoiceParticipant[]>>(new Map());
    const channelStartedAt = ref<Map<number, number>>(new Map());
    const parkedAfkChannelId = ref<number | null>(null);
    const userVolumes = ref<Map<string, number>>(new Map());

    const connectionQuality = ref<ConnectionQuality>(ConnectionQuality.Unknown);

    const pttEnabled = ref(false);
    const pttKey = ref<string | null>(null);
    const pttBinding = ref<PttBinding | null>(null);
    const pttSoundEnabled = ref(true);
    const selectedMicDeviceId = ref<string | undefined>(undefined);
    const availableMics = ref<MediaDeviceInfo[]>([]);
    const selectedSpeakerDeviceId = ref<string | undefined>(undefined);
    const availableSpeakers = ref<MediaDeviceInfo[]>([]);
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
    let screenShareMonitorTrack: MediaStreamTrack | null = null;
    let isRestartingScreenShare = false;

    const screenShareVideoPubs = new Map<string, RemoteTrackPublication>();

    watch(activeScreenShareView, (id) => {
        for (const [identity, pub] of screenShareVideoPubs) {
            pub.setEnabled(identity === id);
        }
    });

    let pttActive = false;

    const pttSpeakingByIdentity = new Map<string, boolean>();
    const pttSeqByIdentity = new Map<string, number>();
    let pttSeq = 0;

    const VAD_TRAILING_HOLD_MS = 400;
    const vadSpeaking = new Set<string>();
    const vadClearTimers = new Map<string, ReturnType<typeof setTimeout>>();

    async function loadSettings(): Promise<void> {
        const [enabled, key, binding, keycode, modifiers, sound, micId, speakerId, ns, ec, agc, ssQuality, volumes] =
            await Promise.all([
                window.api.settings.get('voice:pttEnabled'),
                window.api.settings.get('voice:pttKey'),
                window.api.settings.get('voice:pttBinding'),
                window.api.settings.get('voice:pttKeycode'),
                window.api.settings.get('voice:pttModifiers'),
                window.api.settings.get('voice:pttSoundEnabled'),
                window.api.settings.get('voice:micDeviceId'),
                window.api.settings.get('voice:speakerDeviceId'),
                window.api.settings.get('voice:noiseSuppression'),
                window.api.settings.get('voice:echoCancellation'),
                window.api.settings.get('voice:autoGainControl'),
                window.api.settings.get('voice:screenShareQuality'),
                window.api.settings.get('voice:userVolumes'),
            ]);

        pttEnabled.value = enabled === 'true';
        pttKey.value = key;
        pttBinding.value = parsePttBinding(binding, keycode, modifiers);
        pttSoundEnabled.value = sound !== 'false';
        selectedMicDeviceId.value = micId && micId !== 'default' ? micId : undefined;
        selectedSpeakerDeviceId.value = speakerId && speakerId !== 'default' ? speakerId : undefined;
        noiseSuppression.value = ns !== 'false';
        echoCancellation.value = ec !== 'false';
        autoGainControl.value = agc !== 'false';
        if (ssQuality && ssQuality in SCREEN_SHARE_PRESETS) {
            screenShareQuality.value = ssQuality as ScreenShareQualityPreset;
        }
        if (volumes) {
            try {
                const parsed = JSON.parse(volumes) as Record<string, number>;
                userVolumes.value = new Map(
                    Object.entries(parsed).map(([id, v]) => [id, Math.min(2, Math.max(0, Number(v)))]),
                );
            } catch {
                // ignore malformed stored volumes
            }
        }
    }

    function getUserVolume(id: string): number {
        return userVolumes.value.get(id) ?? 1;
    }

    function setUserVolume(id: string, volume: number): void {
        const v = Math.min(2, Math.max(0, volume));
        userVolumes.value.set(id, v);
        userVolumes.value = new Map(userVolumes.value); // trigger reactivity
        window.api.settings.set('voice:userVolumes', JSON.stringify(Object.fromEntries(userVolumes.value)));
        if (room && !isSoundMuted.value) {
            room.remoteParticipants.get(id)?.setVolume(v);
        }
    }

    let room: Room | null = null;

    let keyProvider: IndexedKeyProvider | null = null;
    let e2eeKeyIndex = 0;

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
        if (currentChannel.value && channelId === currentChannel.value.id) {
            return currentParticipants.value;
        }
        return channelParticipantsMap.value.get(channelId) ?? [];
    }

    function getChannelStartedAt(channelId: number): number | null {
        return channelStartedAt.value.get(channelId) ?? null;
    }

    function getLocalMicTrack(): MediaStreamTrack | null {
        if (!room) return null;
        const pub = room.localParticipant.getTrackPublication(Track.Source.Microphone);
        return pub?.track?.mediaStreamTrack ?? null;
    }

    function seedChannelMapFromRoster(channelId: number, selfIdentity: string): void {
        const others = currentParticipants.value
            .filter((p) => String(p.id) !== String(selfIdentity))
            .map((p) => ({ ...p, isSpeaking: false, isMuted: false, isScreenSharing: false }));
        if (others.length > 0) {
            channelParticipantsMap.value.set(channelId, others);
        } else {
            channelParticipantsMap.value.delete(channelId);
        }
    }

    async function fetchVoiceParticipants(): Promise<void> {
        try {
            const data = await getVoiceParticipants();

            const rebuilt = new Map<number, VoiceParticipant[]>();
            const rebuiltStartedAt = new Map<number, number>();
            const usersStore = useUsersStore();

            for (const [channelIdStr, participants] of Object.entries(data.participants)) {
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
                rebuilt.set(channelId, mapped);

                usersStore.hydrateFromUsers(
                    participants.map((p) => ({
                        id: String(p.id),
                        username: p.username,
                        display_name: p.display_name,
                        avatar_urls: p.avatar_urls,
                    })),
                );
            }

            for (const [channelIdStr, startedAt] of Object.entries(data.started_at)) {
                if (startedAt !== null) rebuiltStartedAt.set(Number(channelIdStr), startedAt);
            }

            if (currentChannel.value) rebuilt.delete(currentChannel.value.id);
            channelParticipantsMap.value = rebuilt;
            channelStartedAt.value = rebuiltStartedAt;
        } catch {
            // ignore — keep the previous participant map
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
                        started_at: number | null;
                    }) => {
                        if (data.started_at !== null) {
                            channelStartedAt.value.set(data.channel_id, data.started_at);
                        } else {
                            channelStartedAt.value.delete(data.channel_id);
                        }

                        if (currentChannel.value && data.channel_id === currentChannel.value.id) return;
                        const participants = channelParticipantsMap.value.get(data.channel_id) ?? [];
                        if (!participants.some((p) => String(p.id) === String(data.user.id))) {
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
                .listen('.voice.left', (data: { user_id: number; channel_id: number; started_at: number | null }) => {
                    if (data.started_at !== null) {
                        channelStartedAt.value.set(data.channel_id, data.started_at);
                    } else {
                        channelStartedAt.value.delete(data.channel_id);
                    }

                    if (currentChannel.value && data.channel_id === currentChannel.value.id) return;
                    const participants = channelParticipantsMap.value.get(data.channel_id);
                    if (participants) {
                        const filtered = participants.filter((p) => String(p.id) !== String(data.user_id));
                        if (filtered.length > 0) {
                            channelParticipantsMap.value.set(data.channel_id, filtered);
                        } else {
                            channelParticipantsMap.value.delete(data.channel_id);
                        }
                    }
                })
                .listen(
                    '.voice.moved',
                    (data: {
                        user_id: number;
                        from_channel_id: number;
                        to_channel_id: number;
                        to_channel_name: string;
                    }) => {
                        const selfId = useAuthStore().user?.id;
                        if (selfId && String(data.user_id) === String(selfId)) {
                            void joinChannel(data.to_channel_id, data.to_channel_name);
                            return;
                        }

                        const movedParticipant = channelParticipantsMap.value
                            .get(data.from_channel_id)
                            ?.find((p) => String(p.id) === String(data.user_id));

                        if (!(currentChannel.value && data.from_channel_id === currentChannel.value.id)) {
                            const fromParticipants = channelParticipantsMap.value.get(data.from_channel_id);
                            if (fromParticipants) {
                                const filtered = fromParticipants.filter((p) => String(p.id) !== String(data.user_id));
                                if (filtered.length > 0) {
                                    channelParticipantsMap.value.set(data.from_channel_id, filtered);
                                } else {
                                    channelParticipantsMap.value.delete(data.from_channel_id);
                                }
                            }
                        }

                        if (!(currentChannel.value && data.to_channel_id === currentChannel.value.id)) {
                            const toParticipants = channelParticipantsMap.value.get(data.to_channel_id) ?? [];
                            if (!toParticipants.some((p) => String(p.id) === String(data.user_id))) {
                                channelParticipantsMap.value.set(data.to_channel_id, [
                                    ...toParticipants,
                                    movedParticipant ?? {
                                        id: data.user_id,
                                        username: String(data.user_id),
                                        displayName: String(data.user_id),
                                        isSpeaking: false,
                                        isMuted: false,
                                        isScreenSharing: false,
                                        avatarUrls: null,
                                    },
                                ]);
                            }
                        }
                    },
                )
                .listen(
                    '.voice.key_rotated',
                    (data: { channel_id: number; e2ee_key: string; e2ee_key_index: number }) => {
                        void applyRotatedKey(data.channel_id, data.e2ee_key, data.e2ee_key_index);
                    },
                );
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
        const mutedAttr = p.attributes?.[MUTED_ATTRIBUTE];
        const isMuted = mutedAttr === 'true';

        const pttState = pttSpeakingByIdentity.get(p.identity);
        const isSpeaking = pttState !== undefined ? pttState : vadSpeaking.has(p.identity);

        return {
            id: p.identity,
            username: p.identity,
            displayName: p.name || p.identity,
            isSpeaking,
            isMuted,
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
            isSpeaking: pttEnabled.value ? pttActive && !isMicMuted.value : vadSpeaking.has(local.identity),
            isMuted: isMicMuted.value,
            isScreenSharing: isScreenSharing.value,
            avatarUrls: findExistingAvatarUrls(local.identity),
        });

        room.remoteParticipants.forEach((p) => {
            list.push(participantFromRemote(p));
        });

        currentParticipants.value = list;
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
                isSpeaking: pttEnabled.value ? pttActive && !isMicMuted.value : room.localParticipant.isSpeaking,
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
    }

    function wireRoomEvents(r: Room): void {
        r.on(RoomEvent.ParticipantConnected, (participant) => {
            applyRemoteAudioState(participant);

            if (pttEnabled.value && pttActive && !isMicMuted.value) {
                broadcastPttSpeaking(true, [participant.identity]);
            }
            refreshParticipants();
        });
        r.on(RoomEvent.ParticipantDisconnected, (participant) => {
            pttSpeakingByIdentity.delete(participant.identity);
            pttSeqByIdentity.delete(participant.identity);
            const vt = vadClearTimers.get(participant.identity);
            if (vt) {
                clearTimeout(vt);
                vadClearTimers.delete(participant.identity);
            }
            vadSpeaking.delete(participant.identity);
            screenShareVideoPubs.delete(participant.identity);
            screenShareParticipants.value = screenShareParticipants.value.filter(
                (s) => s.identity !== participant.identity,
            );
            if (activeScreenShareView.value === participant.identity) {
                activeScreenShareView.value = null;
            }
            refreshParticipants();
        });
        r.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
            if (track.kind === Track.Kind.Audio && track.source === Track.Source.Microphone) {
                const el = track.attach();
                el.dataset.participantAudio = participant.identity;
                document.body.appendChild(el);
                applyRemoteAudioState(participant);
                updateParticipantTracks(participant.identity);
                return;
            }
            if (track.source === Track.Source.ScreenShare) {
                screenShareVideoPubs.set(participant.identity, publication);
                publication.setEnabled(activeScreenShareView.value === participant.identity);

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
            } else if (track.source === Track.Source.ScreenShareAudio) {
                screenShareParticipants.value = screenShareParticipants.value.map((s) =>
                    s.identity === participant.identity
                        ? { ...s, audioTrack: { mediaStreamTrack: track.mediaStreamTrack } }
                        : s,
                );
            }
            updateParticipantTracks(participant.identity);
        });
        r.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
            if (track.kind === Track.Kind.Audio && track.source === Track.Source.Microphone) {
                track.detach().forEach((el) => el.remove());
                updateParticipantTracks(participant.identity);
                return;
            }
            if (track.source === Track.Source.ScreenShare) {
                screenShareVideoPubs.delete(participant.identity);
                screenShareParticipants.value = screenShareParticipants.value.filter(
                    (s) => s.identity !== participant.identity,
                );
                if (activeScreenShareView.value === participant.identity) {
                    activeScreenShareView.value = null;
                }
            } else if (track.source === Track.Source.ScreenShareAudio) {
                screenShareParticipants.value = screenShareParticipants.value.map((s) =>
                    s.identity === participant.identity ? { ...s, audioTrack: null } : s,
                );
            }
            updateParticipantTracks(participant.identity);
        });
        r.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
            applyVadSpeakers(new Set(speakers.map((s) => s.identity)));
            const localId = r.localParticipant.identity;
            currentParticipants.value = currentParticipants.value.map((p) => {
                const idStr = String(p.id);
                if (idStr === localId) {
                    return {
                        ...p,
                        isSpeaking: pttEnabled.value ? pttActive && !isMicMuted.value : vadSpeaking.has(localId),
                    };
                }
                const pttState = pttSpeakingByIdentity.get(idStr);
                const isSpeaking = pttState !== undefined ? pttState : vadSpeaking.has(idStr);
                return { ...p, isSpeaking };
            });
        });
        r.on(RoomEvent.ParticipantAttributesChanged, (changed, participant) => {
            if (participant === r.localParticipant) return;
            updateParticipantTracks(participant.identity);
        });
        r.on(RoomEvent.MediaDevicesChanged, () => {
            void refreshAvailableMics();
        });
        r.on(RoomEvent.AudioPlaybackStatusChanged, () => {
            isAudioPlaybackBlocked.value = !r.canPlaybackAudio;
        });
        r.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
            if (topic === PTT_DATA_TOPIC) {
                handlePttData(payload, participant);
                return;
            }
            useSoundboardStore().handleIncoming(payload);
        });
        r.on(RoomEvent.TrackMuted, (_pub, participant) => {
            updateParticipantTracks(participant.identity);
        });
        r.on(RoomEvent.TrackUnmuted, (_pub, participant) => {
            updateParticipantTracks(participant.identity);
        });
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
                void resyncE2eeKey();
                void syncMicEnabled();
                syncMuteAttribute();
                broadcastPttSpeaking(pttEnabled.value ? desiredMicLive() : null);
                refreshParticipants();
            }
        });

        r.on(RoomEvent.Disconnected, () => {
            if (room === r) {
                if (currentChannel.value) {
                    seedChannelMapFromRoster(currentChannel.value.id, r.localParticipant.identity);
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
        if (isJoining) {
            return;
        }
        isJoining = true;

        try {
            if (parkedAfkChannelId.value !== null) {
                await leaveAfk();
            }

            if (room && room.state === ConnectionState.Connected) {
                await leaveChannel();
            }

            const { token, url, e2ee_key, e2ee_key_index, started_at } = await joinVoiceChannel(channelId);

            if (started_at !== null) channelStartedAt.value.set(channelId, started_at);

            const E2EE_ENABLED = false;

            keyProvider = E2EE_ENABLED ? new IndexedKeyProvider() : null;
            e2eeKeyIndex = e2ee_key_index ?? 0;

            room = new Room({
                adaptiveStream: true,
                dynacast: true,
                webAudioMix: true,
                ...(keyProvider
                    ? {
                          e2ee: {
                              keyProvider,
                              worker: new Worker(new URL('livekit-client/e2ee-worker', import.meta.url)),
                          },
                      }
                    : {}),
                audioCaptureDefaults: buildAudioCaptureDefaults(),
                audioOutput: { deviceId: selectedSpeakerDeviceId.value },
                publishDefaults: {
                    videoCodec: 'vp9' as VideoCodec,
                    backupCodec: { codec: 'vp8' },
                    videoEncoding: VideoPresets.h720.encoding,
                    videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
                    screenShareEncoding: { maxBitrate: 3_000_000, maxFramerate: 30 },
                },
            });
            wireRoomEvents(room);

            if (keyProvider) {
                await keyProvider.setKeyAt(e2ee_key, e2eeKeyIndex);
            }
            await room.connect(url, token);

            await publishMicTrack();

            room.remoteParticipants.forEach((p) => {
                applyRemoteAudioState(p);
            });

            syncMuteAttribute();

            if (pttEnabled.value) {
                broadcastPttSpeaking(pttActive && !isMicMuted.value);
            }

            currentChannel.value = { id: channelId, name: channelName };

            void syncMicEnabled();
            refreshParticipants();
        } catch (err) {
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
        if (screenShareMonitorTrack) {
            try {
                screenShareMonitorTrack.stop();
            } catch {
                // ignore
            }
            screenShareMonitorTrack = null;
        }
        isScreenSharing.value = false;
        screenShareVideoPubs.clear();
        screenShareParticipants.value = [];
        activeScreenShareView.value = null;
    }

    async function captureSystemAudioMonitor(): Promise<MediaStreamTrack | null> {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const monitors = devices.filter((d) => d.kind === 'audioinput' && /monitor/i.test(d.label));
            if (monitors.length === 0) {
                return null;
            }
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: { exact: monitors[0].deviceId },
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                },
            });
            return stream.getAudioTracks()[0] ?? null;
        } catch {
            return null;
        }
    }

    async function startScreenShare(): Promise<void> {
        if (!room || room.state !== ConnectionState.Connected) return;
        if (isScreenSharing.value) return;

        const preset = SCREEN_SHARE_PRESETS[screenShareQuality.value];

        const resolution =
            preset.width > 0
                ? { width: preset.width, height: preset.height, frameRate: preset.frameRate }
                : { width: 2560, height: 1440, frameRate: preset.frameRate };

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
                    scalabilityMode: 'L3T3_KEY',
                    degradationPreference: 'maintain-framerate',
                });
                localVideoTrack.on(TrackEvent.Ended, () => {
                    void stopScreenShare();
                });
            }

            const audioPublishOptions = {
                source: Track.Source.ScreenShareAudio,
                name: 'screen-audio',
                audioPreset: AudioPresets.musicHighQualityStereo,
                dtx: false,
                red: true,
            };

            let audioMediaStreamTrack: MediaStreamTrack | null = null;
            if (localAudioTrack) {
                await room.localParticipant.publishTrack(localAudioTrack, audioPublishOptions);
                audioMediaStreamTrack = localAudioTrack.mediaStreamTrack;
            } else {
                screenShareMonitorTrack = await captureSystemAudioMonitor();
                if (screenShareMonitorTrack) {
                    await room.localParticipant.publishTrack(screenShareMonitorTrack, audioPublishOptions);
                    audioMediaStreamTrack = screenShareMonitorTrack;
                }
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
                    audioTrack: audioMediaStreamTrack ? { mediaStreamTrack: audioMediaStreamTrack } : null,
                },
            ];

            refreshParticipants();
        } catch {
            // ignore — screen share failed to start
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
            } catch {
                // ignore
            }
        }
        screenShareTracks = [];
        if (screenShareMonitorTrack) {
            try {
                await room.localParticipant.unpublishTrack(screenShareMonitorTrack, true);
            } catch {
                // ignore
            }
            try {
                screenShareMonitorTrack.stop();
            } catch {
                // ignore
            }
            screenShareMonitorTrack = null;
        }
        isScreenSharing.value = false;

        const localIdentity = room.localParticipant.identity;
        screenShareParticipants.value = screenShareParticipants.value.filter((s) => s.identity !== localIdentity);
        if (activeScreenShareView.value === localIdentity) {
            activeScreenShareView.value = screenShareParticipants.value[0]?.identity ?? null;
        }

        refreshParticipants();
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
        const localIdentity = oldRoom?.localParticipant.identity ?? null;

        room = null;
        keyProvider = null;
        e2eeKeyIndex = 0;
        pttActive = false;
        isReconnecting.value = false;
        micReacquirePending = false;
        pttSpeakingByIdentity.clear();
        pttSeqByIdentity.clear();
        clearVadSpeaking();
        cleanupScreenShare();

        if (oldRoom) {
            if (currentChannel.value) {
                leaveVoiceMembership(currentChannel.value.id).catch(() => {});
            }
            try {
                await oldRoom.disconnect();
            } catch {
                // ignore
            }
        }
        if (currentChannel.value && localIdentity) {
            seedChannelMapFromRoster(currentChannel.value.id, localIdentity);
        }
        currentChannel.value = null;
        currentParticipants.value = [];
        isMicMuted.value = false;
        isSoundMuted.value = false;
        connectionQuality.value = ConnectionQuality.Unknown;
        isAudioPlaybackBlocked.value = false;
    }

    async function goAfk(afkChannelId: number): Promise<void> {
        if (!currentChannel.value) return;

        await leaveChannel();
        parkedAfkChannelId.value = afkChannelId;

        const self = useAuthStore().user;
        if (self) {
            const existing = channelParticipantsMap.value.get(afkChannelId) ?? [];
            if (!existing.some((p) => String(p.id) === String(self.id))) {
                channelParticipantsMap.value.set(afkChannelId, [
                    ...existing,
                    {
                        id: self.id,
                        username: self.username,
                        displayName: self.username,
                        isSpeaking: false,
                        isMuted: false,
                        isScreenSharing: false,
                        avatarUrls: self.avatar_urls ?? null,
                    },
                ]);
            }
        }

        try {
            await parkAfk();
        } catch {
            // best-effort — AFK presence is cosmetic
        }
    }

    async function leaveAfk(): Promise<void> {
        const afkChannelId = parkedAfkChannelId.value;
        if (afkChannelId === null) return;
        parkedAfkChannelId.value = null;

        const existing = channelParticipantsMap.value.get(afkChannelId);
        if (existing) {
            const selfId = useAuthStore().user?.id;
            const filtered = existing.filter((p) => String(p.id) !== String(selfId));
            if (filtered.length > 0) {
                channelParticipantsMap.value.set(afkChannelId, filtered);
            } else {
                channelParticipantsMap.value.delete(afkChannelId);
            }
        }

        try {
            await unparkAfk();
        } catch {
            // best-effort — AFK presence is cosmetic
        }
    }

    function syncMuteAttribute(): void {
        if (!room) return;
        room.localParticipant.setAttributes({ [MUTED_ATTRIBUTE]: String(isMicMuted.value) }).catch(() => {});
    }

    function broadcastPttSpeaking(speaking: boolean | null, to?: string[]): void {
        if (!room) return;
        const payload = new TextEncoder().encode(JSON.stringify({ s: speaking, n: ++pttSeq }));
        room.localParticipant
            .publishData(payload, { reliable: false, topic: PTT_DATA_TOPIC, destinationIdentities: to })
            .catch(() => {});
    }

    function handlePttData(payload: Uint8Array, participant?: RemoteParticipant): void {
        if (!participant) return;
        let msg: { s?: boolean | null; n?: number };
        try {
            msg = JSON.parse(new TextDecoder().decode(payload));
        } catch {
            return;
        }
        const id = participant.identity;
        if (typeof msg.n === 'number') {
            // Ignore stale/reordered lossy packets.
            const last = pttSeqByIdentity.get(id) ?? -1;
            if (msg.n <= last) {
                return;
            }
            pttSeqByIdentity.set(id, msg.n);
        }
        if (msg.s === null || msg.s === undefined) {
            pttSpeakingByIdentity.delete(id);
        } else {
            pttSpeakingByIdentity.set(id, msg.s);
        }
        updateParticipantTracks(id);
    }

    function applyRemoteAudioState(p: RemoteParticipant): void {
        p.getTrackPublication(Track.Source.Microphone)?.setEnabled(!isSoundMuted.value);
        p.setVolume(isSoundMuted.value ? 0 : getUserVolume(p.identity));
    }

    function applyVadSpeakers(activeIds: Set<string>): void {
        activeIds.forEach((id) => {
            const pending = vadClearTimers.get(id);
            if (pending) {
                clearTimeout(pending);
                vadClearTimers.delete(id);
            }
            vadSpeaking.add(id);
        });
        vadSpeaking.forEach((id) => {
            if (activeIds.has(id) || vadClearTimers.has(id)) return;
            const timer = setTimeout(() => {
                vadClearTimers.delete(id);
                vadSpeaking.delete(id);
                if (room) updateParticipantTracks(id);
            }, VAD_TRAILING_HOLD_MS);
            vadClearTimers.set(id, timer);
        });
    }

    function clearVadSpeaking(): void {
        vadClearTimers.forEach((t) => clearTimeout(t));
        vadClearTimers.clear();
        vadSpeaking.clear();
    }

    async function applyRotatedKey(channelId: number, key: string, keyIndex: number): Promise<void> {
        if (!keyProvider || !currentChannel.value || channelId !== currentChannel.value.id) return;
        if (keyIndex <= e2eeKeyIndex) {
            return;
        }
        e2eeKeyIndex = keyIndex;
        await keyProvider.setKeyAt(key, keyIndex);
    }

    async function resyncE2eeKey(): Promise<void> {
        if (!keyProvider || !currentChannel.value) return;
        try {
            const { e2ee_key, e2ee_key_index } = await getVoiceChannelKey(currentChannel.value.id);
            if (e2ee_key_index < e2eeKeyIndex) return;
            e2eeKeyIndex = e2ee_key_index;
            await keyProvider.setKeyAt(e2ee_key, e2ee_key_index);
        } catch {
            // ignore — will retry on the next rotation
        }
    }

    function desiredMicLive(): boolean {
        return !isMicMuted.value && (!pttEnabled.value || pttActive);
    }

    let micOpChain: Promise<void> = Promise.resolve();
    let micReacquirePending = false;

    function syncMicEnabled(reacquire = false): Promise<void> {
        if (reacquire) micReacquirePending = true;
        micOpChain = micOpChain
            .then(async () => {
                if (!room || room.state !== ConnectionState.Connected) return;
                const target = desiredMicLive();
                if (micReacquirePending) {
                    micReacquirePending = false;
                    const defaults = buildAudioCaptureDefaults();
                    await room.localParticipant.setMicrophoneEnabled(false);
                    await room.localParticipant.setMicrophoneEnabled(target, defaults, micPublishOptions);
                } else {
                    await room.localParticipant.setMicrophoneEnabled(target);
                }
            })
            .catch(() => {});
        return micOpChain;
    }

    async function publishMicTrack(): Promise<void> {
        if (!room) return;
        const startMuted = !desiredMicLive();
        const tryPublish = async (capture: ReturnType<typeof buildAudioCaptureDefaults>): Promise<void> => {
            const track = await createLocalAudioTrack(capture);
            if (startMuted) await track.mute();
            await room!.localParticipant.publishTrack(track, micPublishOptions);
        };
        try {
            await tryPublish(buildAudioCaptureDefaults());
        } catch {
            try {
                await tryPublish({ ...buildAudioCaptureDefaults(), deviceId: undefined });
            } catch {
                // ignore — no microphone available, join without mic
            }
        }
    }

    async function toggleMic() {
        isMicMuted.value = !isMicMuted.value;
        if (room) {
            await syncMicEnabled();
            syncMuteAttribute();
            refreshParticipants();
        }
    }

    async function toggleSound() {
        isSoundMuted.value = !isSoundMuted.value;
        if (!room) return;
        room.remoteParticipants.forEach((p) => {
            applyRemoteAudioState(p);
        });
    }

    async function refreshAvailableMics() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            availableMics.value = devices.filter((d) => d.kind === 'audioinput');
            availableSpeakers.value = devices.filter((d) => d.kind === 'audiooutput');

            const selectedMic = selectedMicDeviceId.value;
            if (selectedMic && !availableMics.value.some((d) => d.deviceId === selectedMic)) {
                selectedMicDeviceId.value = undefined;
                window.api.settings.set('voice:micDeviceId', '');
                if (room && room.state === ConnectionState.Connected) {
                    void reapplyAudioProcessing();
                }
            }

            const selectedSpeaker = selectedSpeakerDeviceId.value;
            if (selectedSpeaker && !availableSpeakers.value.some((d) => d.deviceId === selectedSpeaker)) {
                selectedSpeakerDeviceId.value = undefined;
                window.api.settings.set('voice:speakerDeviceId', '');
            }
        } catch {
            availableMics.value = [];
            availableSpeakers.value = [];
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

    async function setSpeakerDevice(deviceId: string | undefined) {
        selectedSpeakerDeviceId.value = deviceId;
        window.api.settings.set('voice:speakerDeviceId', deviceId ?? '');

        if (room && room.state === ConnectionState.Connected) {
            try {
                await room.switchActiveDevice('audiooutput', deviceId ?? 'default');
            } catch {
                // ignore
            }
        }
    }

    async function enableAudioPlayback(): Promise<void> {
        if (!room) return;
        try {
            await room.startAudio();
            isAudioPlaybackBlocked.value = !room.canPlaybackAudio;
        } catch {
            // ignore
        }
    }

    function setPttEnabled(enabled: boolean) {
        pttEnabled.value = enabled;
        window.api.settings.set('voice:pttEnabled', String(enabled));

        void syncMicEnabled();
        if (enabled) {
            broadcastPttSpeaking(pttActive && !isMicMuted.value);
        } else {
            broadcastPttSpeaking(null);
        }
        refreshParticipants();
        syncPttConfig();
    }

    function setPttKey(displayName: string | null, binding: PttBinding | null = null) {
        pttKey.value = displayName;
        pttBinding.value = binding;

        window.api.settings.set('voice:pttKey', displayName ?? '');
        window.api.settings.set('voice:pttBinding', binding ? JSON.stringify(binding) : '');
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

        await syncMicEnabled(true);
    }

    function syncPttConfig() {
        const b = pttBinding.value;

        const binding: PttBinding | null =
            b == null
                ? null
                : b.device === 'mouse'
                  ? { device: 'mouse', button: b.button }
                  : { device: 'keyboard', keycode: b.keycode, modifiers: { ...b.modifiers } };
        window.api.ptt.configure({ enabled: pttEnabled.value, binding });
    }

    function handlePttActivated() {
        if (!pttEnabled.value) return;

        pttActive = true;

        if (room && isConnected.value) {
            syncMicEnabled();
            broadcastPttSpeaking(desiredMicLive());
            refreshParticipants();
            if (!isMicMuted.value && pttSoundEnabled.value) playPttActivateSound();
        }
    }

    function handlePttDeactivated() {
        const wasActive = pttActive;
        pttActive = false;
        if (!pttEnabled.value) return;

        if (room && isConnected.value) {
            syncMicEnabled();
            broadcastPttSpeaking(false);
            refreshParticipants();
            if (wasActive && pttSoundEnabled.value) playPttDeactivateSound();
        }
    }

    let pttDisposers: Array<() => void> = [];

    function initPttListeners() {
        cleanupPttListeners();
        pttDisposers.push(window.api.ptt.onActivated(handlePttActivated));
        pttDisposers.push(window.api.ptt.onDeactivated(handlePttDeactivated));

        syncPttConfig();
    }

    function cleanupPttListeners() {
        pttDisposers.forEach((dispose) => dispose());
        pttDisposers = [];
    }

    async function $reset(): Promise<void> {
        await leaveChannel();
        cleanupPttListeners();
        unsubscribeFromVoiceChannels();
        channelParticipantsMap.value = new Map();
        channelStartedAt.value = new Map();
        pttEnabled.value = false;
        pttKey.value = null;
        pttBinding.value = null;
        pttSoundEnabled.value = true;
        selectedMicDeviceId.value = undefined;
        availableMics.value = [];
        selectedSpeakerDeviceId.value = undefined;
        availableSpeakers.value = [];
        noiseSuppression.value = true;
        echoCancellation.value = true;
        autoGainControl.value = true;
        screenShareQuality.value = 'high';
        screenShareViewMode.value = 'pip';
        screenShareAudioMuted.value = true;
        parkedAfkChannelId.value = null;
    }

    return {
        currentChannel,
        connectionQuality,
        isMicMuted,
        isSoundMuted,
        isReconnecting,
        currentParticipants,
        parkedAfkChannelId,
        isConnected,
        pttEnabled,
        pttKey,
        pttBinding,
        pttSoundEnabled,
        selectedMicDeviceId,
        availableMics,
        selectedSpeakerDeviceId,
        availableSpeakers,
        isAudioPlaybackBlocked,
        noiseSuppression,
        echoCancellation,
        autoGainControl,
        getChannelParticipants,
        getChannelStartedAt,
        getLocalMicTrack,
        userVolumes,
        getUserVolume,
        setUserVolume,
        loadSettings,
        fetchVoiceParticipants,
        subscribeToVoiceChannels,
        unsubscribeFromVoiceChannels,
        joinChannel,
        leaveChannel,
        goAfk,
        leaveAfk,
        toggleMic,
        toggleSound,
        refreshAvailableMics,
        setMicDevice,
        setSpeakerDevice,
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
