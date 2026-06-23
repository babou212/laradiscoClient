import type { JsonApiRelationship, JsonApiResource, MessageResource } from '@/api/types';


export function userResource(id: string, attrs: Record<string, unknown> = {}): JsonApiResource {
    return {
        id,
        type: 'users',
        attributes: { username: `user${id}`, ...attrs },
    };
}

export function reactionResource(id: string, userId: number, emoji: string): JsonApiResource {
    return {
        id,
        type: 'reactions',
        attributes: { user_id: userId, emoji, created_at: '2026-01-01T00:00:00Z' },
    };
}

export function attachmentResource(id: string, attrs: Record<string, unknown> = {}): JsonApiResource {
    return {
        id,
        type: 'attachments',
        attributes: {
            file_name: 'file.png',
            mime_type: 'image/png',
            size: 1234,
            has_thumbnail: true,
            ...attrs,
        },
    };
}

export function threadResource(id: string, attrs: Record<string, unknown> = {}): JsonApiResource {
    return {
        id,
        type: 'threads',
        attributes: {
            name: 'thread',
            message_count: 3,
            last_message_at: '2026-01-02T00:00:00Z',
            is_following: false,
            created_at: '2026-01-01T00:00:00Z',
            ...attrs,
        },
    };
}

export function messageResource(
    id: string,
    attrs: Record<string, unknown> = {},
    relationships: MessageResource['relationships'] = {},
): MessageResource {
    return {
        id,
        type: 'messages',
        attributes: {
            content: 'hello',
            is_edited: false,
            edited_at: null,
            deleted_at: null,
            reply_to_id: null,
            created_at: '2026-01-01T00:00:00Z',
            ...attrs,
        },
        relationships,
    } as MessageResource;
}

export function rel<T extends string>(type: T, id: string): JsonApiRelationship<T> {
    return { data: { type, id } };
}

export function relMany<T extends string>(type: T, ids: string[]): JsonApiRelationship<T> {
    return { data: ids.map((id) => ({ type, id })) };
}
