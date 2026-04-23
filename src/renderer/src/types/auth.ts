export type User = {
    id: string;
    name: string;
    username: string;
    email: string;
    avatar_urls?: { thumb: string; small: string; medium: string; original: string } | null;
    email_verified_at: string | null;
    created_at: string;
    updated_at: string;
    [key: string]: unknown;
};

export type AuthPermissions = {
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
};

export type Auth = {
    user: User;
    permissions?: AuthPermissions;
};

export type TwoFactorConfigContent = {
    title: string;
    description: string;
    buttonText: string;
};
