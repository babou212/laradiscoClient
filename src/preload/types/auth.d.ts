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
    user_id: number;
    user_name: string;
    user_email: string;
    user_avatar: string | null;
    token: string;
    saved_at: string;
}

export interface AuthApi {
    login: (
        host: string,
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
        challengeToken: string,
        code: string | null,
        recoveryCode: string | null,
    ) => Promise<{ success: boolean; user?: AuthUser; token?: string; error?: string }>;
    getSession: () => Promise<AuthSession | null>;
    logout: (host: string) => Promise<{ success: boolean }>;
    validate: (host: string, token: string) => Promise<{ valid: boolean; user?: AuthUser }>;
    validateInvite: (host: string, token: string) => Promise<{ success: boolean; error?: string }>;
    register: (
        host: string,
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
