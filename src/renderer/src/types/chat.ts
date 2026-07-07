export interface KlipyGifFile {
    url: string;
    width?: number;
    height?: number;
}

export interface KlipyGif {
    id: string | number;
    title?: string;
    file: {
        hd?: { gif?: KlipyGifFile };
        md?: { gif?: KlipyGifFile };
        sm?: { gif?: KlipyGifFile };
        xs?: { gif?: KlipyGifFile };
    };
}

export interface Category {
    id: string;
    name: string;
    position: number;
    channels: Channel[];
}

export interface Channel {
    id: string;
    name: string;
    topic: string | null;
    type: string;
    is_private?: boolean;
    permissions?: ChannelPermissions;
    has_unread?: boolean;
}

export interface ChannelPermissions {
    canSendMessages: boolean;
    canManageMessages: boolean;
    canPinMessages: boolean;
    canAddReactions: boolean;
    canAttachFiles: boolean;
    canMentionEveryone: boolean;
}

export interface LinkPreviewData {
    url: string;
    title: string;
    description?: string;
    site_name?: string;
    image?: { id: string; mime_type: string; size: number; width?: number; height?: number };
    image_url?: string;
    image_width?: number;
    image_height?: number;
    fetched_at: number;
}

export interface Attachment {
    id: string;
    file_name: string;
    mime_type: string;
    size: number;
    width?: number | null;
    height?: number | null;
    has_thumbnail: boolean;
    thumbnail_size?: number | null;
    thumbnail_data_url?: string; // optimistic-render preview only
    status?: string;
}

export interface AvatarUrls {
    thumb: string;
    small: string;
    medium: string;
    original: string;
}

export interface MessageUser {
    id: string;
    username: string;
    avatar_urls: AvatarUrls | null;
}

export interface MessageReaction {
    id: string;
    message_id: string;
    user_id: string;
    emoji: string;
}

export interface ThreadPreview {
    id: string;
    message_count: number;
    last_message_at: string;
    is_following?: boolean;
    last_reply?: {
        id: string;
        content: string | null;
        user: MessageUser;
        created_at: string;
    } | null;
}

export interface MessageData {
    id: string;
    content: string | null;
    is_edited: boolean;
    edited_at: string | null;
    deleted_at: string | null;
    reply_to_id: string | null;
    thread_id?: string | null;
    thread?: ThreadPreview | null;
    reply_to?: {
        id: string;
        content: string | null;
        user: MessageUser;
        link_preview?: LinkPreviewData | null;
    } | null;
    user: MessageUser;
    /** Username snapshot retained when the author's account has been deleted from the server. */
    deleted_author_name?: string | null;
    reactions: MessageReaction[];
    created_at: string;
    is_pinned?: boolean;
    pinned_at?: string | null;
    pinned_by?: MessageUser | null;
    attachments?: Attachment[];
    link_preview?: LinkPreviewData | null;
    client_temp_id?: string | null;
    send_status?: 'sending' | 'failed';
}

export interface MessagesResponse {
    data: MessageData[];
    next_cursor?: string | null;
    prev_cursor?: string | null;
    next_page_url?: string | null;
    prev_page_url?: string | null;
}

export interface DirectMessageThread {
    id: string;
    other_user: {
        id: string;
        username: string;
        avatar_urls: AvatarUrls | null;
    };
    last_message?: {
        content: string;
        created_at: string;
    };
}

export interface Mention {
    id: string;
    username: string;
    display_name: string;
    avatar_urls: AvatarUrls | null;
}

export interface VoiceChannelParticipant {
    id: string;
    username: string;
    display_name: string;
    avatar_urls: AvatarUrls | null;
}
