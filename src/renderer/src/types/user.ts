import type { AvatarUrls } from './chat';

export type UserStatusType = 'online' | 'idle' | 'dnd' | 'offline';

export type ActivityType = 'game' | 'music' | 'app';

/**
 * A user's live rich-presence activity (e.g. "Playing Counter-Strike 2").
 * Ephemeral presence state that travels on the `presence` channel; `started_at`
 * is an epoch-seconds timestamp stamped server-side.
 */
export interface UserActivity {
    type: ActivityType;
    name: string;
    application_id: string;
    details?: string | null;
    icon?: string | null;
    started_at: number;
}

export interface UserRole {
    id: string;
    name: string;
    color: string;
    position: number;
}

export interface UserProfile {
    id: string;
    username: string;
    email: string;
    email_verified_at: string | null;
    avatar_urls: AvatarUrls | null;
    about_me: string | null;
    custom_status: string | null;
    last_seen_at: string | null;
    created_at: string;
    updated_at: string;
    roles?: UserRole[];
}

export interface OnlineUser {
    id: string;
    username: string;
    display_name: string;
    avatar_urls: AvatarUrls | null;
    custom_status: string | null;
    status?: UserStatusType;
    activity?: UserActivity | null;
}

export interface PresenceUpdate {
    user_id: string | number;
    username: string;
    display_name?: string;
    avatar_urls: AvatarUrls | null;
    status: UserStatusType;
    custom_status: string | null;
    activity?: UserActivity | null;
}
