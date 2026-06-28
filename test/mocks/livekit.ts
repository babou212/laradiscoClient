import { vi } from 'vitest';


const encoding = (maxBitrate: number) => ({ maxBitrate, maxFramerate: 30 });

export const VideoPresets = {
    h180: { encoding: encoding(150_000) },
    h360: { encoding: encoding(500_000) },
    h720: { encoding: encoding(1_700_000) },
    h1080: { encoding: encoding(3_000_000) },
};

export const AudioPresets = {
    music: { maxBitrate: 128_000 },
    speech: { maxBitrate: 24_000 },
};

export const ConnectionQuality = { Excellent: 'excellent', Good: 'good', Poor: 'poor', Unknown: 'unknown' };
export const ConnectionState = { Disconnected: 'disconnected', Connected: 'connected', Reconnecting: 'reconnecting' };

export const RoomEvent = new Proxy({}, { get: (_t, p) => String(p) });
export const TrackEvent = new Proxy({}, { get: (_t, p) => String(p) });
export const Track = { Source: { Camera: 'camera', Microphone: 'microphone', ScreenShare: 'screen_share' } };

export class Room {
    on = vi.fn().mockReturnThis();
    off = vi.fn().mockReturnThis();
    connect = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn().mockResolvedValue(undefined);
    localParticipant = {
        setMicrophoneEnabled: vi.fn(),
        setAttributes: vi.fn(),
        setScreenShareEnabled: vi.fn(),
        identity: 'local',
    };
    remoteParticipants = new Map();
}

export class ExternalE2EEKeyProvider {
    setKey = vi.fn();
}

export class BaseKeyProvider {
    onSetEncryptionKey = vi.fn();
    on = vi.fn();
    emit = vi.fn();
}

export const createKeyMaterialFromString = vi.fn(async () => ({}) as CryptoKey);

export default {
    Room,
    RoomEvent,
    TrackEvent,
    Track,
    VideoPresets,
    AudioPresets,
    ConnectionQuality,
    ConnectionState,
    BaseKeyProvider,
    createKeyMaterialFromString,
};
