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
    validateInvite: (host: string, token: string) => Promise<{ success: boolean; error?: string }>;
    register: (
        host: string,
        serverId: number,
        inviteToken: string,
        name: string,
        username: string,
        email: string,
        password: string,
        passwordConfirmation: string,
    ) => Promise<{
        success: boolean;
        user?: AuthUser;
        token?: string;
        error?: string;
        errors?: Record<string, string[]>;
    }>;
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

interface ScreenSource {
    id: string;
    name: string;
    thumbnail: string;
    appIcon: string | null;
    display_id: string;
}

interface ScreenApi {
    onShowPicker: (callback: (sources: ScreenSource[]) => void) => void;
    selectSource: (sourceId: string | null) => void;
    removeAllListeners: () => void;
}

interface SettingsApi {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<{ success: boolean }>;
}

interface UpdaterApi {
    check: () => Promise<{ success: boolean; version?: string; error?: string }>;
    download: () => Promise<{ success: boolean; error?: string }>;
    install: () => void;
    onUpdateAvailable: (callback: (info: { version: string; releaseNotes: string }) => void) => void;
    onUpToDate: (callback: () => void) => void;
    onDownloadProgress: (
        callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void,
    ) => void;
    onUpdateDownloaded: (callback: () => void) => void;
    onError: (callback: (error: string) => void) => void;
    removeAllListeners: () => void;
}

interface MlsSetupResult {
    deviceId: string;
    deviceName: string;
    identityBytes: string;
    identityKey: string;
    keyPackages: Array<{ key_package_bytes: string; key_package_hash: string }>;
}

interface MlsKeyBackup {
    encryptedBundle: string;
    salt: string;
    nonce: string;
    argon2Params: { memory: number; iterations: number; parallelism: number };
}

interface MlsGroupInfo {
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

interface MlsApi {
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
    addMember: (params: { serverId: number; groupId: string; keyPackageBytes: string }) => Promise<{
        proposal: string;
        commit: string;
        welcome: string;
        ratchetTree: string;
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
    }) => Promise<{ msgType: string; payload: string | null; epoch: number }>;
    selfUpdate: (params: { serverId: number; groupId: string }) => Promise<{
        commit: string;
        welcome: string | null;
        epoch: number;
    }>;
    mergeCommit: (params: { serverId: number; groupId: string }) => Promise<{ epoch: number }>;
    clearPendingCommit: (params: { serverId: number; groupId: string }) => Promise<{ success: boolean }>;
    generateKeyPackages: (
        serverId: number,
        count: number,
    ) => Promise<Array<{ key_package_bytes: string; key_package_hash: string }>>;
    getGroupInfo: (params: { serverId: number; groupId: string }) => Promise<MlsGroupInfo | null>;
    backupKeys: (serverId: number, pin: string) => Promise<MlsKeyBackup>;
    restoreKeys: (serverId: number, backup: MlsKeyBackup, pin: string) => Promise<{ success: boolean; error?: string }>;
    autoUpdateBackup: (serverId: number) => Promise<MlsKeyBackup | null>;
    hasBackupKey: (serverId: number) => Promise<boolean>;
    clearBackupKey: (serverId?: number) => Promise<{ success: boolean }>;
    wipe: (serverId: number) => Promise<{ success: boolean }>;
    wipeForUserMismatch: (serverId: number, userId: number) => Promise<boolean>;
    generateSearchTokens: (params: {
        serverId: number;
        conversationId: string;
        plaintext: string;
    }) => Promise<string[]>;
    generateSearchTrapdoor: (params: { serverId: number; conversationId: string; query: string }) => Promise<string[]>;
}

interface MessagesApi {
    storePlaintext: (serverId: number, messageId: number, plaintext: string) => Promise<void>;
    getPlaintext: (serverId: number, messageId: number) => Promise<string | null>;
    getPlaintexts: (serverId: number, messageIds: number[]) => Promise<Record<number, string>>;
}

interface AppApi {
    server: ServerApi;
    auth: AuthApi;
    ptt: PttApi;
    notifications: NotificationsApi;
    screen: ScreenApi;
    settings: SettingsApi;
    window: WindowApi;
    updater: UpdaterApi;
    mls: MlsApi;
    messages: MessagesApi;
}

declare global {
    interface Window {
        electron: ElectronAPI;
        api: AppApi;
    }
}
