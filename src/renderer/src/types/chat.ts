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

export interface EncryptedAttachmentMeta {
    id: string;
    key: string; // base64 AES-256-GCM key
    iv: string; // base64 IV
    file_name: string;
    mime_type: string;
    size: number;
    thumbnail_key?: string;
    thumbnail_iv?: string;
    thumbnail_width?: number;
    thumbnail_height?: number;
    thumbnail_data_url?: string; // local blob URL for optimistic rendering
}

export interface ServerAttachment {
    id: string;
    storage_path: string;
    encrypted_size: number;
    thumbnail_path: string | null;
    thumbnail_size: number | null;
    status: string;
}

export interface AvatarUrls {
    thumb: string;
    small: string;
    medium: string;
    original: string;
}

export interface MessageUser {
    id: number;
    username: string;
    avatar_urls: AvatarUrls | null;
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
    encrypted_attachments?: ServerAttachment[];
    decrypted_attachments?: EncryptedAttachmentMeta[];
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
        avatar_urls: AvatarUrls | null;
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
    avatar_urls: AvatarUrls | null;
}

export interface VoiceChannelParticipant {
    id: number;
    username: string;
    display_name: string;
    avatar_urls: AvatarUrls | null;
}
