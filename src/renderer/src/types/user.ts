import type { AvatarUrls } from './chat';

export type UserStatusType = 'online' | 'idle' | 'dnd' | 'offline';

export interface UserRole {
    id: number;
    name: string;
    color: string;
    position: number;
}

export interface UserProfile {
    id: number;
    username: string;
    email: string;
    email_verified_at: string | null;
    nickname: string | null;
    avatar_urls: AvatarUrls | null;
    about_me: string | null;
    custom_status: string | null;
    last_seen_at: string | null;
    created_at: string;
    updated_at: string;
    roles?: UserRole[];
}

export interface OnlineUser {
    id: number;
    username: string;
    display_name: string;
    avatar_urls: AvatarUrls | null;
    custom_status: string | null;
    status?: UserStatusType;
}
