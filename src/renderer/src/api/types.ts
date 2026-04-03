// ─── JSON:API Generic Types ───────────────────────────────────────────────────

export interface JsonApiResourceIdentifier<T extends string = string> {
    id: string;
    type: T;
}

export interface JsonApiRelationship<T extends string = string> {
    data: JsonApiResourceIdentifier<T> | JsonApiResourceIdentifier<T>[] | null;
}

export interface JsonApiResource<
    T extends string = string,
    Attrs = Record<string, unknown>,
    Rels = Record<string, JsonApiRelationship>,
> {
    id: string;
    type: T;
    attributes: Attrs;
    relationships?: Rels;
}

export interface JsonApiResponse<D> {
    data: D;
    included?: JsonApiResource[];
    meta?: Record<string, unknown>;
}

export interface JsonApiCollectionResponse<D> {
    data: D[];
    included?: JsonApiResource[];
    meta?: Record<string, unknown>;
    links?: {
        first?: string | null;
        last?: string | null;
        prev?: string | null;
        next?: string | null;
    };
}

export interface JsonApiError {
    status: string;
    title: string;
    detail?: string;
    source?: { pointer?: string; parameter?: string };
}

export interface JsonApiErrorResponse {
    errors: JsonApiError[];
}

export interface CategoryAttributes {
    name: string;
    position: number;
    created_at: string;
}

export interface ChannelAttributes {
    name: string;
    topic: string | null;
    channel_type: string;
    is_private?: boolean;
    position?: number;
    channelPermissions?: ChannelPermissions;
}

export interface ChannelPermissions {
    canSendMessages: boolean;
    canManageMessages: boolean;
    canPinMessages: boolean;
    canAddReactions: boolean;
    canAttachFiles: boolean;
    canMentionEveryone: boolean;
}

export interface UserAttributes {
    username: string;
    name?: string;
    email?: string;
    display_name?: string;
    email_verified_at?: string | null;
    nickname?: string | null;
    avatar_urls?: AvatarUrls | null;
    about_me?: string | null;
    custom_status?: string | null;
    last_seen_at?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface AvatarUrls {
    thumb: string;
    small: string;
    medium: string;
    original: string;
}

export interface MessageAttributes {
    sender_device_id?: string;
    message_bytes?: string;
    content: string;
    is_edited: boolean;
    edited_at: string | null;
    deleted_at: string | null;
    reply_to_id: string | null;
    thread_id?: string | null;
    is_pinned?: boolean;
    pinned_at?: string | null;
    created_at: string;
}

export interface DirectMessageAttributes {
    sender_device_id?: string;
    message_bytes?: string;
    content: string;
    is_edited: boolean;
    edited_at: string | null;
    deleted_at: string | null;
    reply_to_id: string | null;
    is_pinned?: boolean;
    pinned_at?: string | null;
    created_at: string;
}

export interface DirectMessageGroupAttributes {
    other_user: {
        id: string;
        username: string;
        avatar_urls: AvatarUrls | null;
    };
    last_message?: {
        content: string;
        created_at: string;
    } | null;
}

export interface ThreadAttributes {
    name: string;
    message_count: number;
    last_message_at: string;
    is_following?: boolean;
    created_at: string;
}

export interface ReactionAttributes {
    user_id: number;
    emoji: string;
    created_at: string;
}

export interface NotificationAttributes {
    notification_type: string;
    data: Record<string, unknown>;
    read_at: string | null;
    created_at: string;
}

export interface RoleAttributes {
    name: string;
    color: string;
    position: number;
    permissions?: string[];
    is_hoisted?: boolean;
    is_mentionable?: boolean;
    is_default?: boolean;
    users_count?: number;
}

export interface InviteLinkAttributes {
    token: string;
    max_uses: number | null;
    uses: number;
    used_at: string | null;
    expires_at: string | null;
    created_at: string;
}

export interface EncryptedAttachmentAttributes {
    storage_path: string;
    encrypted_size: number;
    thumbnail_path: string | null;
    thumbnail_size: number | null;
    status: string;
}

export type CategoryResource = JsonApiResource<
    'categories',
    CategoryAttributes,
    { channels?: JsonApiRelationship<'channels'> }
>;

export type ChannelResource = JsonApiResource<'channels', ChannelAttributes>;

export type UserResource = JsonApiResource<
    'users',
    UserAttributes,
    { roles?: JsonApiRelationship<'roles'> }
>;

export type MessageResource = JsonApiResource<
    'messages',
    MessageAttributes,
    {
        user?: JsonApiRelationship<'users'>;
        reactions?: JsonApiRelationship<'reactions'>;
        replyTo?: JsonApiRelationship<'messages'>;
        threadStarted?: JsonApiRelationship<'threads'>;
        encryptedAttachments?: JsonApiRelationship<'encrypted-attachments'>;
    }
>;

export type DirectMessageResource = JsonApiResource<
    'direct-messages',
    DirectMessageAttributes,
    {
        user?: JsonApiRelationship<'users'>;
        reactions?: JsonApiRelationship<'reactions'>;
        replyTo?: JsonApiRelationship<'direct-messages'>;
        encryptedAttachments?: JsonApiRelationship<'encrypted-attachments'>;
    }
>;

export type DirectMessageGroupResource = JsonApiResource<
    'direct-message-groups',
    DirectMessageGroupAttributes,
    { participants?: JsonApiRelationship<'users'> }
>;

export type ThreadResource = JsonApiResource<
    'threads',
    ThreadAttributes,
    {
        user?: JsonApiRelationship<'users'>;
        latestReply?: JsonApiRelationship<'messages'>;
    }
>;

export type ReactionResource = JsonApiResource<'reactions', ReactionAttributes>;

export type NotificationResource = JsonApiResource<'notifications', NotificationAttributes>;

export type RoleResource = JsonApiResource<'roles', RoleAttributes>;

export type InviteLinkResource = JsonApiResource<
    'invite-links',
    InviteLinkAttributes,
    {
        creator?: JsonApiRelationship<'users'>;
        usedByUser?: JsonApiRelationship<'users'>;
    }
>;

export type EncryptedAttachmentResource = JsonApiResource<
    'encrypted-attachments',
    EncryptedAttachmentAttributes
>;

/** Find included resources by type and id(s) from a JSON:API response */
export function findIncluded<R = JsonApiResource>(
    included: JsonApiResource[] | undefined,
    type: string,
    id: string,
): R | undefined;
export function findIncluded<R = JsonApiResource>(
    included: JsonApiResource[] | undefined,
    type: string,
    ids: string[],
): R[];
export function findIncluded<R = JsonApiResource>(
    included: JsonApiResource[] | undefined,
    type: string,
    idOrIds: string | string[],
): R | R[] | undefined {
    if (!included) return Array.isArray(idOrIds) ? [] : undefined;
    if (Array.isArray(idOrIds)) {
        return included.filter((r) => r.type === type && idOrIds.includes(r.id)) as R[];
    }
    return included.find((r) => r.type === type && r.id === idOrIds) as R | undefined;
}

/** Extract relationship IDs from a JSON:API relationship */
export function relationshipIds(rel: JsonApiRelationship | undefined): string[] {
    if (!rel?.data) return [];
    if (Array.isArray(rel.data)) return rel.data.map((r) => r.id);
    return [rel.data.id];
}

/** Extract a single relationship ID */
export function relationshipId(rel: JsonApiRelationship | undefined): string | null {
    if (!rel?.data || Array.isArray(rel.data)) return null;
    return rel.data.id;
}
