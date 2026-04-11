export interface AuthPermissions {
    canInviteMembers: boolean;
    canManageRoles: boolean;
    canManageChannels: boolean;
    canManageServer: boolean;
    canManageMessages: boolean;
    canBanMembers: boolean;
    canKickMembers: boolean;
    canViewAuditLog: boolean;
    isAdministrator: boolean;
    isBanned: boolean;
    isJailed: boolean;
}

export interface AuthUser {
    id: string;
    name: string;
    username: string;
    email: string;
    avatar_urls: { thumb: string; small: string; medium: string; original: string } | null;
    permissions?: AuthPermissions;
}

export interface AuthSession {
    id: number;
    server_id: number;
    user_id: number;
    user_name: string;
    user_email: string;
    user_avatar: string | null;
    token: string;
    created_at: string;
}

export interface AuthApi {
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
