export interface KeyPair {
    publicKey: Uint8Array<ArrayBuffer>;
    privateKey: Uint8Array<ArrayBuffer>;
}

export interface UserIdentityKeyPair {
    publicKey: Uint8Array<ArrayBuffer>;
    privateKey: Uint8Array<ArrayBuffer>;
}

export interface DeviceIdentityKeyPair {
    publicKey: Uint8Array<ArrayBuffer>;
    privateKey: Uint8Array<ArrayBuffer>;
    signature: Uint8Array<ArrayBuffer>;
}

export interface SignedPreKey {
    id: number;
    keyPair: KeyPair;
    signature: Uint8Array<ArrayBuffer>;
    timestamp: number;
}

export interface OneTimePreKey {
    id: number;
    keyPair: KeyPair;
}

export interface DeviceKeyBundle {
    deviceId: string;
    deviceName: string | null;
    deviceIdentityKey: Uint8Array<ArrayBuffer>;
    identitySignature: Uint8Array<ArrayBuffer>;
    signedPrekey: Uint8Array<ArrayBuffer>;
    signedPrekeyId: number;
    signedPrekeySignature: Uint8Array<ArrayBuffer>;
    oneTimePrekey: {
        prekeyId: number;
        publicKey: Uint8Array<ArrayBuffer>;
    } | null;
}

export interface UserKeyBundle {
    userId: number;
    identityKey: Uint8Array<ArrayBuffer>;
    devices: DeviceKeyBundle[];
}

export interface LocalDeviceKeys {
    deviceId: string;
    deviceName: string;
    userIdentityKeyPair: UserIdentityKeyPair;
    deviceIdentityKeyPair: DeviceIdentityKeyPair;
    signedPreKey: SignedPreKey;
    oneTimePreKeys: OneTimePreKey[];
}

export interface SenderKeyState {
    distributionId: string;
    chainKey: Uint8Array<ArrayBuffer>;
    signingKeyPair: KeyPair;
    chainIndex: number;
    baseChainKey: Uint8Array<ArrayBuffer>;
    baseChainIndex: number;
}

export interface EncryptedMessagePayload {
    v: number;
    type: 'sender_key';
    sender_device_id: string;
    ct?: string;
    nonce?: string;
    sig?: string;
    dId?: string;
    ci?: number;
    ts: number;
}

export interface KeyBackupBundle {
    version: number;
    userIdentityPrivateKey: string;
    deviceIdentityPrivateKey: string;
    sourceDeviceId: string;
    signedPreKeys: Array<{ id: number; privateKey: string }>;
    oneTimePreKeys: Array<{ id: number; privateKey: string }>;
    senderKeys: Array<{
        channelId: number;
        userId: string;
        deviceId: string;
        distributionId: string;
        state: string;
    }>;
}
