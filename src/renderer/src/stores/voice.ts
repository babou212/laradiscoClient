import type { LocalAudioTrack, LocalVideoTrack, RemoteParticipant, VideoCodec, VideoEncoding } from 'livekit-client';
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
import { computed, ref } from 'vue';
import { getVoiceChannelKey, getVoiceParticipants, joinVoiceChannel, leaveVoiceMembership } from '@/api/voice';
import { IndexedKeyProvider } from '@/lib/voice-key-provider';
import { registerVoiceStateDump, vlog, vwarn } from '@/lib/voice-logger';
import { getEcho } from '@/lib/echo';
import { playPttActivateSound, playPttDeactivateSound } from '@/lib/ptt-sounds';
import type { AvatarUrls } from '@/types/chat';
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

export const useVoiceStore = defineStore('voice', () => {
    const currentChannel = ref<VoiceChannel | null>(null);
    const isMicMuted = ref(false);
    const isSoundMuted = ref(false);
    const isReconnecting = ref(false);
    const currentParticipants = ref<VoiceParticipant[]>([]);
    const channelParticipantsMap = ref<Map<number, VoiceParticipant[]>>(new Map());
    const userVolumes = ref<Map<string, number>>(new Map()); // userId -> 0..2 (1 = 100%)

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
    let statsTimer: ReturnType<typeof setInterval> | null = null;

    let pttActive = false;

    const pttSpeakingByIdentity = new Map<string, boolean>();
    const pttSeqByIdentity = new Map<string, number>();
    let pttSeq = 0;

    const VAD_TRAILING_HOLD_MS = 400;
    const vadSpeaking = new Set<string>();
    const vadClearTimers = new Map<string, ReturnType<typeof setTimeout>>();

    async function loadSettings(): Promise<void> {
        const [enabled, key, keycode, modifiers, sound, micId, speakerId, ns, ec, agc, ssQuality, volumes] =
            await Promise.all([
                window.api.settings.get('voice:pttEnabled'),
                window.api.settings.get('voice:pttKey'),
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
            } catch (error) {
                console.error('[Voice] Failed to parse saved user volumes:', error);
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
        red: false,
    } as const;

    function getChannelParticipants(channelId: number): VoiceParticipant[] {
        if (currentChannel.value && channelId === currentChannel.value.id) {
            return currentParticipants.value;
        }
        return channelParticipantsMap.value.get(channelId) ?? [];
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
            const usersStore = useUsersStore();

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

            if (currentChannel.value) rebuilt.delete(currentChannel.value.id);
            channelParticipantsMap.value = rebuilt;
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
                .listen('.voice.left', (data: { user_id: number; channel_id: number }) => {
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
            vlog('part', 'participant connected', { id: participant.identity, total: r.remoteParticipants.size + 1 });
            applyRemoteAudioState(participant);

            if (pttEnabled.value && pttActive && !isMicMuted.value) {
                broadcastPttSpeaking(true, [participant.identity]);
            }
            refreshParticipants();
        });
        r.on(RoomEvent.ParticipantDisconnected, (participant) => {
            vlog('part', 'participant disconnected', { id: participant.identity, total: r.remoteParticipants.size });
            pttSpeakingByIdentity.delete(participant.identity);
            pttSeqByIdentity.delete(participant.identity);
            const vt = vadClearTimers.get(participant.identity);
            if (vt) {
                clearTimeout(vt);
                vadClearTimers.delete(participant.identity);
            }
            vadSpeaking.delete(participant.identity);
            screenShareParticipants.value = screenShareParticipants.value.filter(
                (s) => s.identity !== participant.identity,
            );
            if (activeScreenShareView.value === participant.identity) {
                activeScreenShareView.value = null;
            }
            refreshParticipants();
        });
        r.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
            vlog('part', 'track subscribed', { id: participant.identity, kind: track.kind, source: track.source });
            if (track.kind === Track.Kind.Audio && track.source === Track.Source.Microphone) {
                const el = track.attach();
                el.dataset.participantAudio = participant.identity;
                document.body.appendChild(el);
                applyRemoteAudioState(participant);
                updateParticipantTracks(participant.identity);
                return;
            }
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
            vlog('part', 'track unsubscribed', { id: participant.identity, kind: track.kind, source: track.source });
            if (track.kind === Track.Kind.Audio && track.source === Track.Source.Microphone) {
                track.detach().forEach((el) => el.remove());
                updateParticipantTracks(participant.identity);
                return;
            }
            if (track.source === Track.Source.ScreenShare) {
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
            vlog('speak', 'active speakers (VAD)', { speakers: speakers.map((s) => s.identity) });
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
            vlog('part', 'attributes changed', { id: participant.identity, changed });
            updateParticipantTracks(participant.identity);
        });
        r.on(RoomEvent.MediaDevicesChanged, () => {
            vlog('audio', 'media devices changed');
            void refreshAvailableMics();
        });
        r.on(RoomEvent.AudioPlaybackStatusChanged, () => {
            isAudioPlaybackBlocked.value = !r.canPlaybackAudio;
            vlog('audio', 'playback status changed', { canPlayback: r.canPlaybackAudio });
        });
        r.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
            if (topic === PTT_DATA_TOPIC) {
                handlePttData(payload, participant);
                return;
            }
            useSoundboardStore().handleIncoming(payload);
        });
        r.on(RoomEvent.TrackMuted, (_pub, participant) => {
            vlog('part', 'track muted', { id: participant.identity });
            updateParticipantTracks(participant.identity);
        });
        r.on(RoomEvent.TrackUnmuted, (_pub, participant) => {
            vlog('part', 'track unmuted', { id: participant.identity });
            updateParticipantTracks(participant.identity);
        });
        r.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
            if (participant.identity === r.localParticipant.identity) {
                vlog('conn', 'connection quality', { quality });
                connectionQuality.value = quality;
            }
        });

        r.on(RoomEvent.Reconnecting, () => {
            vlog('conn', 'reconnecting…');
            if (room === r) isReconnecting.value = true;
        });
        r.on(RoomEvent.Reconnected, () => {
            vlog('conn', 'reconnected — reconciling state');
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
            vlog('conn', 'disconnected', { wasCurrentRoom: room === r });
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
            vlog('conn', 'join ignored — already joining', { channelId });
            return;
        }
        isJoining = true;
        vlog('conn', 'join start', {
            channelId,
            channelName,
            pttEnabled: pttEnabled.value,
            micMuted: isMicMuted.value,
        });

        try {
            if (room && room.state === ConnectionState.Connected) {
                await leaveChannel();
            }

            const { token, url, e2ee_key, e2ee_key_index } = await joinVoiceChannel(channelId);
            vlog('conn', 'token received', { url, hasKey: !!e2ee_key, keyIndex: e2ee_key_index });

            keyProvider = new IndexedKeyProvider();
            e2eeKeyIndex = e2ee_key_index ?? 0;

            room = new Room({
                adaptiveStream: true,
                dynacast: true,
                webAudioMix: true, // route remote audio through Web Audio GainNode so per-user volume can boost >100%
                e2ee: {
                    keyProvider,
                    worker: new Worker(new URL('livekit-client/e2ee-worker', import.meta.url)),
                },
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

            await keyProvider.setKeyAt(e2ee_key, e2eeKeyIndex);
            vlog('e2ee', 'initial key applied', { keyIndex: e2eeKeyIndex });
            await room.connect(url, token);
            vlog('conn', 'room connected', { state: room.state, remotes: room.remoteParticipants.size });
            startStatsDiagnostics();

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
            vlog('conn', 'join complete', {
                channelName,
                participants: currentParticipants.value.length,
                desiredMicLive: desiredMicLive(),
            });
        } catch (err) {
            vwarn('conn', 'join failed', err);
            room = null;
            throw err;
        } finally {
            isJoining = false;
        }
    }

    // --- Temporary WebRTC stats diagnostics -------------------------------------
    // Polls sender/receiver RTCStatsReports every 2s while in a channel to tell
    // apart the three causes of screen-share stutter: encoder-limited (publisher
    // qualityLimit=cpu, fps drops), network-limited (relay/tcp transport, packet
    // loss, low availOutBitrate, RTT), or receiver-side (inbound freezeCount /
    // jitterBuffer growth). Logs under the `stats` category; toggle with the usual
    // `__voiceLog` console helpers. Remove once the quality issue is diagnosed.
    function summarizeOutbound(report: RTCStatsReport): Record<string, unknown> | null {
        const byId = new Map<string, Record<string, unknown>>();
        const out: Record<string, unknown> = {};
        let hasVideo = false;
        let pair: Record<string, unknown> | null = null;
        report.forEach((raw, id) => {
            const s = raw as Record<string, unknown>;
            byId.set(id, s);
            if (s.type === 'outbound-rtp' && s.kind === 'video') {
                hasVideo = true;
                Object.assign(out, {
                    res: `${s.frameWidth ?? '?'}x${s.frameHeight ?? '?'}`,
                    fps: s.framesPerSecond,
                    qualityLimit: s.qualityLimitationReason, // none | cpu | bandwidth | other
                    qualityLimitDurations: s.qualityLimitationDurations,
                    targetKbps: typeof s.targetBitrate === 'number' ? Math.round(s.targetBitrate / 1000) : undefined,
                    framesEncoded: s.framesEncoded,
                    framesSent: s.framesSent,
                    nackRecv: s.nackCount,
                    pliRecv: s.pliCount,
                    encoder: s.encoderImplementation,
                    scalabilityMode: s.scalabilityMode,
                });
            } else if (s.type === 'remote-inbound-rtp' && s.kind === 'video') {
                Object.assign(out, {
                    rttToSfuMs: typeof s.roundTripTime === 'number' ? Math.round(s.roundTripTime * 1000) : undefined,
                    remotePacketsLost: s.packetsLost,
                    remoteJitterMs: typeof s.jitter === 'number' ? Math.round(s.jitter * 1000) : undefined,
                    fractionLost: s.fractionLost,
                });
            } else if (s.type === 'media-source' && s.kind === 'video') {
                // The raw capture rate, BEFORE encode. If captureFps is itself low/unstable
                // the bottleneck is the screen capturer; if captureFps is a steady 30 but
                // framesEncoded fps lags, the bottleneck is the encoder.
                Object.assign(out, {
                    captureFps: s.framesPerSecond,
                    captureRes: `${s.width ?? '?'}x${s.height ?? '?'}`,
                });
            } else if (s.type === 'candidate-pair' && (s.nominated || s.selected)) {
                pair = s;
            }
        });
        if (!hasVideo) return null;
        if (pair) {
            const p = pair as Record<string, unknown>;
            const local = byId.get(p.localCandidateId as string);
            const remote = byId.get(p.remoteCandidateId as string);
            Object.assign(out, {
                transport: local
                    ? `${local.candidateType}/${local.protocol}${local.relayProtocol ? `(${local.relayProtocol})` : ''}`
                    : undefined,
                remoteCand: remote ? `${remote.candidateType}/${remote.protocol}` : undefined,
                availOutKbps:
                    typeof p.availableOutgoingBitrate === 'number'
                        ? Math.round(p.availableOutgoingBitrate / 1000)
                        : undefined,
                pairRttMs: typeof p.currentRoundTripTime === 'number' ? Math.round(p.currentRoundTripTime * 1000) : undefined,
            });
        }
        return out;
    }

    function summarizeInbound(report: RTCStatsReport): Record<string, unknown> | null {
        let out: Record<string, unknown> | null = null;
        report.forEach((raw) => {
            const s = raw as Record<string, unknown>;
            if (s.type === 'inbound-rtp' && s.kind === 'video') {
                const emitted = s.jitterBufferEmittedCount as number | undefined;
                const delay = s.jitterBufferDelay as number | undefined;
                out = {
                    res: `${s.frameWidth ?? '?'}x${s.frameHeight ?? '?'}`,
                    fps: s.framesPerSecond,
                    framesDecoded: s.framesDecoded,
                    framesDropped: s.framesDropped,
                    packetsLost: s.packetsLost,
                    jitterMs: typeof s.jitter === 'number' ? Math.round(s.jitter * 1000) : undefined,
                    avgJitterBufferMs: emitted && delay != null ? Math.round((delay / emitted) * 1000) : undefined,
                    freezeCount: s.freezeCount,
                    totalFreezeSec: s.totalFreezesDuration,
                    pauseCount: s.pauseCount,
                    nackSent: s.nackCount,
                    pliSent: s.pliCount,
                    decoder: s.decoderImplementation,
                };
            }
        });
        return out;
    }

    async function pollVoiceStats(): Promise<void> {
        const r = room;
        if (!r) return;
        try {
            const localVideo = screenShareTracks.find((t) => t.kind === Track.Kind.Video) as LocalVideoTrack | undefined;
            if (localVideo) {
                const report = await localVideo.getRTCStatsReport();
                const out = report ? summarizeOutbound(report) : null;
                if (out) {
                    // Key numbers inline so they're readable in the collapsed console line.
                    const tag = `OUT cap=${out.captureFps ?? '?'} enc=${out.fps ?? '?'} qLim=${out.qualityLimit ?? '?'} ${out.transport ?? ''}`;
                    vlog('stats', tag, out);
                }
            }
            for (const participant of r.remoteParticipants.values()) {
                for (const pub of participant.trackPublications.values()) {
                    if (pub.source !== Track.Source.ScreenShare) continue;
                    const track = pub.track;
                    if (!track || track.kind !== Track.Kind.Video) continue;
                    const report = await track.getRTCStatsReport();
                    const inb = report ? summarizeInbound(report) : null;
                    if (inb) {
                        const tag = `IN(${participant.identity}) fps=${inb.fps ?? '?'} drop=${inb.framesDropped ?? '?'} freeze=${inb.freezeCount ?? '?'}`;
                        vlog('stats', tag, inb);
                    }
                }
            }
        } catch (err) {
            vwarn('stats', 'poll failed', err);
        }
    }

    function startStatsDiagnostics(): void {
        stopStatsDiagnostics();
        statsTimer = setInterval(() => void pollVoiceStats(), 2000);
    }

    function stopStatsDiagnostics(): void {
        if (statsTimer) {
            clearInterval(statsTimer);
            statsTimer = null;
        }
    }

    function cleanupScreenShare(): void {
        stopStatsDiagnostics();
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
        screenShareParticipants.value = [];
        activeScreenShareView.value = null;
    }

    async function captureSystemAudioMonitor(): Promise<MediaStreamTrack | null> {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const monitors = devices.filter((d) => d.kind === 'audioinput' && /monitor/i.test(d.label));
            if (monitors.length === 0) {
                console.warn(
                    '[Voice] No monitor audio source found for screen-share audio. ' +
                        'Available audio inputs: ' +
                        devices
                            .filter((d) => d.kind === 'audioinput')
                            .map((d) => `"${d.label}"`)
                            .join(', '),
                );
                return null;
            }
            console.log('[Voice] Using monitor source for screen-share audio:', monitors[0].label);
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: { exact: monitors[0].deviceId },
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                },
            });
            return stream.getAudioTracks()[0] ?? null;
        } catch (err) {
            console.error('[Voice] Failed to capture system audio monitor:', err);
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
                    scalabilityMode: 'L3T3_KEY',
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
        if (screenShareMonitorTrack) {
            try {
                await room.localParticipant.unpublishTrack(screenShareMonitorTrack, true);
            } catch (err) {
                console.warn('[Voice] Failed to unpublish screen share monitor track:', err);
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
        const localIdentity = oldRoom?.localParticipant.identity ?? null;
        vlog('conn', 'leave channel', { channelId: currentChannel.value?.id ?? null });

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
            } catch (err) {
                console.warn('[Voice] Error during disconnect:', err);
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

    function syncMuteAttribute(): void {
        if (!room) return;
        room.localParticipant
            .setAttributes({ [MUTED_ATTRIBUTE]: String(isMicMuted.value) })
            .catch((err) => console.warn('[Voice] Failed to broadcast mute state:', err));
    }

    function broadcastPttSpeaking(speaking: boolean | null, to?: string[]): void {
        if (!room) return;
        vlog('speak', 'broadcast PTT speaking', { speaking, seq: pttSeq + 1, to: to ?? 'all' });
        const payload = new TextEncoder().encode(JSON.stringify({ s: speaking, n: ++pttSeq }));
        room.localParticipant
            .publishData(payload, { reliable: false, topic: PTT_DATA_TOPIC, destinationIdentities: to })
            .catch((err) => vwarn('speak', 'failed to broadcast PTT speaking', err));
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
                vlog('speak', 'PTT packet dropped (stale)', { id, seq: msg.n, last });
                return;
            }
            pttSeqByIdentity.set(id, msg.n);
        }
        vlog('speak', 'PTT packet received', { id, speaking: msg.s ?? null, seq: msg.n });
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
            vlog('e2ee', 'rotation ignored (stale index)', { keyIndex, current: e2eeKeyIndex });
            return;
        }
        vlog('e2ee', 'applying rotated key', { from: e2eeKeyIndex, to: keyIndex });
        e2eeKeyIndex = keyIndex;
        await keyProvider.setKeyAt(key, keyIndex);
    }

    async function resyncE2eeKey(): Promise<void> {
        if (!keyProvider || !currentChannel.value) return;
        try {
            const { e2ee_key, e2ee_key_index } = await getVoiceChannelKey(currentChannel.value.id);
            if (e2ee_key_index < e2eeKeyIndex) return;
            vlog('e2ee', 'resync key after reconnect', { index: e2ee_key_index, prev: e2eeKeyIndex });
            e2eeKeyIndex = e2ee_key_index;
            await keyProvider.setKeyAt(e2ee_key, e2ee_key_index);
        } catch (err) {
            vwarn('e2ee', 'failed to resync key', err);
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
                vlog('mic', 'apply mic state', {
                    target,
                    reacquire: micReacquirePending,
                    muted: isMicMuted.value,
                    pttActive,
                });
                if (micReacquirePending) {
                    micReacquirePending = false;
                    const defaults = buildAudioCaptureDefaults();
                    await room.localParticipant.setMicrophoneEnabled(false);
                    await room.localParticipant.setMicrophoneEnabled(target, defaults, micPublishOptions);
                } else {
                    await room.localParticipant.setMicrophoneEnabled(target);
                }
            })
            .catch((err) => vwarn('mic', 'failed to apply mic state', err));
        return micOpChain;
    }

    async function publishMicTrack(): Promise<void> {
        if (!room) return;
        const startMuted = !desiredMicLive();
        vlog('mic', 'publishing mic track', { startMuted, deviceId: selectedMicDeviceId.value ?? 'default' });
        const tryPublish = async (capture: ReturnType<typeof buildAudioCaptureDefaults>): Promise<void> => {
            const track = await createLocalAudioTrack(capture);
            if (startMuted) await track.mute();
            await room!.localParticipant.publishTrack(track, micPublishOptions);
        };
        try {
            await tryPublish(buildAudioCaptureDefaults());
            vlog('mic', 'mic track published', { muted: startMuted });
        } catch (micErr) {
            vwarn('mic', 'selected mic unavailable, retrying without deviceId', micErr);
            try {
                await tryPublish({ ...buildAudioCaptureDefaults(), deviceId: undefined });
                vlog('mic', 'mic track published (fallback device)', { muted: startMuted });
            } catch (fallbackErr) {
                vwarn('mic', 'no microphone available — joining without mic', fallbackErr);
            }
        }
    }

    async function toggleMic() {
        isMicMuted.value = !isMicMuted.value;
        vlog('mic', 'toggle mic (self-mute)', { muted: isMicMuted.value });
        if (room) {
            await syncMicEnabled();
            syncMuteAttribute();
            refreshParticipants();
        }
    }

    async function toggleSound() {
        isSoundMuted.value = !isSoundMuted.value;
        vlog('audio', 'toggle deafen', { deafened: isSoundMuted.value, remotes: room?.remoteParticipants.size ?? 0 });
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
            } catch (err) {
                console.warn('[Voice] Failed to switch audio output device:', err);
            }
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
        vlog('ptt', 'PTT mode changed', { enabled, connected: isConnected.value, muted: isMicMuted.value });
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

        await syncMicEnabled(true);
    }

    function syncPttConfig() {
        vlog('ptt', 'configure hook (main process)', {
            enabled: pttEnabled.value,
            keycode: pttKeycode.value,
            key: pttKey.value,
            modifiers: pttModifiers.value,
        });
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
        vlog('ptt', 'key down (activated)', {
            pttEnabled: pttEnabled.value,
            connected: isConnected.value,
            muted: isMicMuted.value,
        });
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
        vlog('ptt', 'key up (deactivated)', { pttEnabled: pttEnabled.value, connected: isConnected.value });
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
        vlog('ptt', 'listeners registered');

        syncPttConfig();
    }

    function cleanupPttListeners() {
        pttDisposers.forEach((dispose) => dispose());
        pttDisposers = [];
    }

    // Full point-in-time snapshot of the voice/PTT/LiveKit state. Exposed in the
    // devtools console as `__voiceLog.dump()` for verifying everything is sane.
    function debugSnapshot(): Record<string, unknown> {
        const snap = {
            channel: currentChannel.value,
            connected: isConnected.value,
            reconnecting: isReconnecting.value,
            roomState: room?.state ?? null,
            connectionQuality: connectionQuality.value,
            micMuted: isMicMuted.value,
            soundDeafened: isSoundMuted.value,
            pttEnabled: pttEnabled.value,
            pttActive,
            pttKey: pttKey.value,
            desiredMicLive: desiredMicLive(),
            screenSharing: isScreenSharing.value,
            e2eeKeyIndex,
            participants: currentParticipants.value.map((p) => ({
                id: p.id,
                speaking: p.isSpeaking,
                muted: p.isMuted,
                screenSharing: p.isScreenSharing,
            })),
            vadSpeaking: [...vadSpeaking],
            pttSpeakingByIdentity: Object.fromEntries(pttSpeakingByIdentity),
        };
        vlog('conn', 'state snapshot', snap);
        return snap;
    }

    registerVoiceStateDump(debugSnapshot);

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
        selectedSpeakerDeviceId.value = undefined;
        availableSpeakers.value = [];
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
        selectedSpeakerDeviceId,
        availableSpeakers,
        isAudioPlaybackBlocked,
        noiseSuppression,
        echoCancellation,
        autoGainControl,
        getChannelParticipants,
        userVolumes,
        getUserVolume,
        setUserVolume,
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
