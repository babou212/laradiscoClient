import type { ElectronAPI } from '@electron-toolkit/preload';

interface ServerConnection {
    id: number;
    name: string;
    host: string;
    is_active: boolean;
    created_at: string;
}

interface AuthPermissions {
    canInviteMembers: boolean;
    canManageRoles: boolean;
    canManageChannels: boolean;
    canManageServer: boolean;
    canManageMessages: boolean;
    isAdministrator: boolean;
}

interface AuthUser {
    id: number;
    name: string;
    username: string;
    email: string;
    avatar_path: string | null;
    permissions?: AuthPermissions;
}

interface AuthSession {
    id: number;
    server_id: number;
    user_id: number;
    user_name: string;
    user_email: string;
    user_avatar: string | null;
    token: string;
    created_at: string;
}

interface ServerApi {
    ping: (host: string) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>;
    save: (name: string, host: string) => Promise<{ success: boolean; connection?: ServerConnection; error?: string }>;
    getActive: () => Promise<ServerConnection | null>;
    getAll: () => Promise<ServerConnection[]>;
    setActive: (id: number) => Promise<{ success: boolean }>;
    remove: (id: number) => Promise<{ success: boolean }>;
}

interface AuthApi {
    login: (
        host: string,
        serverId: number,
        email: string,
        password: string,
    ) => Promise<{
        success: boolean;
        user?: AuthUser;
        token?: string;
        error?: string;
        twoFactor?: boolean;
        challengeToken?: string;
    }>;
    twoFactorChallenge: (
        host: string,
        serverId: number,
        challengeToken: string,
        code: string | null,
        recoveryCode: string | null,
    ) => Promise<{ success: boolean; user?: AuthUser; token?: string; error?: string }>;
    getSession: (serverId: number) => Promise<AuthSession | null>;
    logout: (host: string, serverId: number) => Promise<{ success: boolean }>;
    validate: (host: string, token: string) => Promise<{ valid: boolean; user?: AuthUser }>;
}

interface PttCapturedKey {
    keycode: number;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
}

interface PttApi {
    configure: (config: {
        keycode: number | null;
        ctrl: boolean;
        shift: boolean;
        alt: boolean;
        meta: boolean;
        enabled: boolean;
    }) => Promise<{ success: boolean }>;
    captureNextKey: () => Promise<PttCapturedKey>;
    cancelCapture: () => Promise<{ success: boolean }>;
    onActivated: (callback: () => void) => void;
    onDeactivated: (callback: () => void) => void;
    removeAllListeners: () => void;
}

interface WindowApi {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
    onMaximizedChange: (callback: (_event: unknown, isMaximized: boolean) => void) => void;
    removeMaximizedListener: () => void;
    onBeforeQuit: (callback: () => void) => void;
    removeBeforeQuitListener: () => void;
    platform: string;
}

interface NotificationsApi {
    show: (payload: { title: string; body: string; notificationId: string }) => void;
    onClicked: (callback: (notificationId: string) => void) => void;
    removeAllListeners: () => void;
}

interface SettingsApi {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<{ success: boolean }>;
}

interface E2eeSetupResult {
    userIdentityKey: string;
    deviceId: string;
    deviceName: string;
    deviceIdentityKey: string;
    identitySignature: string;
    signedPrekey: string;
    signedPrekeyId: number;
    signedPrekeySignature: string;
    oneTimePrekeys: Array<{ prekeyId: number; publicKey: string }>;
}

interface E2eePublicKeys {
    userIdentityKey: string;
    deviceIdentityKey: string;
    deviceId: string;
}

interface E2eeEncryptParams {
    serverId: number;
    type: 'channel' | 'dm';
    targetId: number;
    plaintext: string;
}

interface E2eeDecryptParams {
    serverId: number;
    payload: string;
    senderId: number;
    senderDeviceId: string;
    channelId?: number;
    dmGroupId?: number;
}

interface E2eeKeyBackup {
    encryptedBundle: string;
    salt: string;
    nonce: string;
    argon2Params: { memory: number; iterations: number; parallelism: number };
}

interface E2eeSenderKeyDistribution {
    distributionId: string;
    chainKey: string;
    signingPublicKey: string;
    chainIndex: number;
}

interface E2eeApi {
    isSetup: (serverId: number, userId?: number) => Promise<boolean>;
    getDeviceId: (serverId: number, userId?: number) => Promise<string | null>;
    setup: (serverId: number, deviceName: string, userId?: number) => Promise<E2eeSetupResult>;
    setupDevice: (serverId: number, deviceName: string, userId?: number) => Promise<E2eeSetupResult>;
    getPublicKeys: (serverId: number) => Promise<E2eePublicKeys | null>;
    encrypt: (params: E2eeEncryptParams) => Promise<string>;
    decrypt: (params: E2eeDecryptParams) => Promise<string>;
    createSenderKey: (serverId: number, channelId: number) => Promise<E2eeSenderKeyDistribution>;
    processSenderKeyDist: (params: {
        serverId: number;
        channelId: number;
        senderId: string;
        senderDeviceId: string;
        distribution: E2eeSenderKeyDistribution;
    }) => Promise<{ success: boolean }>;
    backupKeys: (serverId: number, pin: string) => Promise<E2eeKeyBackup>;
    restoreKeys: (
        serverId: number,
        backup: E2eeKeyBackup,
        pin: string,
    ) => Promise<{ success: boolean; error?: string }>;
    rotateSignedPreKey: (serverId: number) => Promise<{
        deviceId: string;
        signedPrekey: string;
        signedPrekeyId: number;
        signedPrekeySignature: string;
    }>;
    generatePreKeys: (serverId: number, count: number) => Promise<Array<{ prekeyId: number; publicKey: string }>>;
    wipe: (serverId: number) => Promise<{ success: boolean }>;
    wipeForUserMismatch: (serverId: number, userId: number) => Promise<boolean>;
    invalidateChannelSenderKeys: (serverId: number, channelId: number) => Promise<{ success: boolean }>;
    encryptSenderKeyDist: (params: {
        distribution: E2eeSenderKeyDistribution;
        recipientDeviceIdentityKey: string;
    }) => Promise<{
        encryptedDistribution: string;
        ephemeralPublicKey: string;
        nonce: string;
    }>;
    decryptSenderKeyDist: (params: {
        serverId: number;
        encryptedDistribution: string;
        ephemeralPublicKey: string;
        nonce: string;
    }) => Promise<E2eeSenderKeyDistribution>;
    generateSearchTokens: (params: {
        serverId: number;
        type: 'channel' | 'dm';
        targetId: number;
        plaintext: string;
    }) => Promise<string[]>;
    generateSearchTrapdoor: (params: {
        serverId: number;
        type: 'channel' | 'dm';
        targetId: number;
        query: string;
    }) => Promise<string[]>;
}

interface AppApi {
    server: ServerApi;
    auth: AuthApi;
    ptt: PttApi;
    notifications: NotificationsApi;
    settings: SettingsApi;
    window: WindowApi;
    e2ee: E2eeApi;
}

declare global {
    interface Window {
        electron: ElectronAPI;
        api: AppApi;
    }
}
