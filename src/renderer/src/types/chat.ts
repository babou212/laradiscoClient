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

export interface MessageData {
    id: number;
    content: string;
    is_edited: boolean;
    edited_at: string | null;
    deleted_at: string | null;
    reply_to_id: number | null;
    reply_to?: {
        id: number;
        content: string;
        user: MessageUser;
        is_encrypted?: boolean;
        decrypted_content?: string;
        decrypt_error?: boolean;
        decrypt_attempts?: number;
    } | null;
    user: MessageUser;
    reactions: MessageReaction[];
    created_at: string;
    is_encrypted?: boolean;
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
