export interface MlsEncrypted {
    message_bytes: string;
    epoch: number;
    sender_device_id: string;
}

export interface MlsApi {
    status: () => Promise<{ established: boolean; deviceId: string }>;
    ensureSetup: (
        host: string,
        token: string,
    ) => Promise<{ deviceId: string; linkRequired: boolean; backupNeeded: boolean }>;
    establishDmGroup: (host: string, token: string, dmId: number) => Promise<void>;
    syncDmGroup: (host: string, token: string, dmId: number) => Promise<void>;
    reconcileAllDmGroups: (host: string, token: string) => Promise<void>;
    localVerification: (peerUserId: number) => Promise<{ pinned: boolean; verified: boolean }>;
    getRequireVerification: () => Promise<boolean>;
    setRequireVerification: (on: boolean) => Promise<void>;
    encryptDm: (dmId: number, text: string) => Promise<MlsEncrypted>;
    decryptDm: (dmId: number, messageId: string, messageBytesB64: string) => Promise<string | null>;
    cacheDm: (dmId: number, messageId: string, plaintext: string) => Promise<void>;
    redecryptDm: (dmId: number, messageId: string, messageBytesB64: string) => Promise<string | null>;
    verificationStatus: (
        host: string,
        token: string,
        peerUserId: number,
    ) => Promise<{ pinned: boolean; verified: boolean; changed: boolean; safetyNumber: string | null }>;
    markVerified: (peerUserId: number) => Promise<void>;
    newRecoveryCode: () => Promise<string>;
    backup: (host: string, token: string, recoveryCode: string) => Promise<void>;
    restore: (host: string, token: string, recoveryCode: string) => Promise<void>;
    backupPrompt: (host: string, token: string) => Promise<string>;
    backupConfirmed: () => Promise<void>;
    wipeLocal: () => Promise<void>;
}
