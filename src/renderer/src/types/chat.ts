export interface Category {
    id: number;
    name: string;
    position: number;
    channels: Channel[];
}

export interface Channel {
    id: number;
    name: string;
    topic: string | null;
    type: string;
    is_private?: boolean;
    permissions?: ChannelPermissions;
}

export interface ChannelPermissions {
    canSendMessages: boolean;
    canManageMessages: boolean;
    canPinMessages: boolean;
    canAddReactions: boolean;
    canAttachFiles: boolean;
    canMentionEveryone: boolean;
}

export interface MessageUser {
    id: number;
    username: string;
    avatar_path: string | null;
}

export interface MessageReaction {
    id: number;
    message_id: number;
    user_id: number;
    emoji: string;
}

export interface ThreadPreview {
    id: number;
    message_count: number;
    last_message_at: string;
    is_following?: boolean;
    last_reply?: {
        id: number;
        content: string;
        user: MessageUser;
        created_at: string;
        sender_device_id?: string;
        decrypted_content?: string;
        decrypt_error?: boolean;
    } | null;
}

export interface MessageData {
    id: number;
    content: string;
    is_edited: boolean;
    edited_at: string | null;
    deleted_at: string | null;
    reply_to_id: number | null;
    thread_id?: number | null;
    thread?: ThreadPreview | null;
    reply_to?: {
        id: number;
        content: string;
        user: MessageUser;
        decrypted_content?: string;
        decrypt_error?: boolean;
        decrypt_attempts?: number;
    } | null;
    user: MessageUser;
    reactions: MessageReaction[];
    created_at: string;
    is_pinned?: boolean;
    pinned_at?: string | null;
    pinned_by?: MessageUser | null;
    sender_device_id?: string;
    decrypted_content?: string;
    decrypt_error?: boolean;
    decrypt_attempts?: number;
}

export interface MessagesResponse {
    data: MessageData[];
    next_cursor?: string | null;
    prev_cursor?: string | null;
    next_page_url?: string | null;
    prev_page_url?: string | null;
}

export interface DirectMessageThread {
    id: number;
    other_user: {
        id: number;
        username: string;
        avatar_path: string | null;
    };
    last_message?: {
        content: string;
        created_at: string;
    };
}

export interface Mention {
    id: number;
    username: string;
    display_name: string;
    avatar_path: string | null;
}

export interface VoiceChannelParticipant {
    id: number;
    username: string;
    display_name: string;
    avatar_path: string | null;
}
