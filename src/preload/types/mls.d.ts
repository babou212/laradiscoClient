export interface MlsSetupResult {
    deviceId: string;
    deviceName: string;
    identityBytes: string;
    identityKey: string;
    keyPackages: Array<{ key_package_bytes: string; key_package_hash: string }>;
}

export interface MlsKeyBackup {
    encryptedBundle: string;
    salt: string;
    nonce: string;
    argon2Params: { memory: number; iterations: number; parallelism: number };
}

export interface MlsGroupInfo {
    groupId: string;
    epoch: number;
    isActive: boolean;
    ownLeafIndex: number;
    members: Array<{
        index: number;
        identity: string;
        signatureKey: string;
    }>;
}

export interface MlsApi {
    isSetup: (serverId: number, userId?: number) => Promise<boolean>;
    getDeviceId: (serverId: number, userId?: number) => Promise<string | null>;
    setup: (serverId: number, deviceName: string, userId?: number) => Promise<MlsSetupResult>;
    setupDevice: (serverId: number, deviceName: string, userId?: number) => Promise<MlsSetupResult>;
    encrypt: (params: { serverId: number; groupId: string; plaintext: string }) => Promise<{
        message_bytes: string;
        epoch: number;
    }>;
    decrypt: (params: { serverId: number; groupId: string; messageBytes: string }) => Promise<{
        msgType: string;
        payload: string | null;
    }>;
    createGroup: (params: { serverId: number; groupId: string }) => Promise<{
        groupId: string;
        epoch: number;
        memberCount: number;
    }>;
    joinGroup: (params: {
        serverId: number;
        welcomeBytes: string;
        ratchetTreeBytes: string;
    }) => Promise<{ groupId: string; epoch: number; memberCount: number }>;
    addMember: (params: {
        serverId: number;
        groupId: string;
        keyPackageBytes: string;
        expectedUserId: number;
        expectedDeviceId: string;
    }) => Promise<{
        commit: string;
        welcome: string;
        epoch: number;
    }>;
    removeMember: (params: {
        serverId: number;
        groupId: string;
        leafIndices: number[];
    }) => Promise<{ commit: string; epoch: number }>;
    processMessage: (params: {
        serverId: number;
        groupId: string;
        messageBytes: string;
        allowedAddUserIds?: number[];
        allowedRemoveLeafIndices?: number[];
    }) => Promise<{
        msgType: string;
        payload: string | null;
        epoch: number;
        stagedCommit: {
            added_identities?: string[];
            removed_indices?: number[];
            updated_identities?: string[];
        } | null;
    }>;
    inspectKeyPackage: (params: {
        keyPackageBytes: string;
    }) => Promise<{ identity: string; userId: number | null; deviceId: string | null }>;
    selfUpdate: (params: { serverId: number; groupId: string }) => Promise<{
        commit: string;
        welcome: string | null;
        epoch: number;
    }>;
    mergeCommit: (params: { serverId: number; groupId: string }) => Promise<{ epoch: number; ratchetTree: string }>;
    clearPendingCommit: (params: { serverId: number; groupId: string }) => Promise<{ success: boolean }>;
    deleteGroup: (params: { serverId: number; groupId: string }) => Promise<{ success: boolean }>;
    generateKeyPackages: (
        serverId: number,
        count: number,
    ) => Promise<Array<{ key_package_bytes: string; key_package_hash: string }>>;
    getGroupInfo: (params: { serverId: number; groupId: string }) => Promise<MlsGroupInfo | null>;
    backupKeys: (serverId: number, pin: string) => Promise<MlsKeyBackup>;
    restoreKeys: (
        serverId: number,
        backup: MlsKeyBackup,
        pin: string,
        userId?: number,
    ) => Promise<{
        success: boolean;
        error?: string;
        e2eeKeys?: {
            deviceIdentityKey: string;
            identitySignature: string;
            signedPreKeyId: number;
            signedPreKey: string;
            signedPreKeySignature: string;
        } | null;
        sourceDeviceId?: string;
        backupTimestamp?: string;
    }>;
    autoUpdateBackup: (serverId: number) => Promise<MlsKeyBackup | null>;
    hasBackupKey: (serverId: number) => Promise<boolean>;
    clearBackupKey: (serverId?: number) => Promise<{ success: boolean }>;
    changePIN: (
        serverId: number,
        backup: MlsKeyBackup,
        oldPin: string,
        newPin: string,
    ) => Promise<{
        success: boolean;
        error?: string;
        backup?: MlsKeyBackup;
    }>;
    setE2eeDeviceKeys: (
        serverId: number,
        keys: {
            deviceIdentityKey: string;
            identitySignature: string;
            signedPreKeyId: number;
            signedPreKey: string;
            signedPreKeySignature: string;
        },
    ) => Promise<{ success: boolean }>;
    isDirty: (serverId: number) => Promise<boolean>;
    startAutoBackup: () => Promise<{ success: boolean }>;
    stopAutoBackup: () => Promise<{ success: boolean }>;
    getLastBackupTimestamp: (serverId: number) => Promise<number | null>;
    setLastBackupTimestamp: (serverId: number, timestamp: number) => Promise<{ success: boolean }>;
    wipe: (serverId: number) => Promise<{ success: boolean }>;
    wipeForUserMismatch: (serverId: number, userId: number) => Promise<boolean>;
}
