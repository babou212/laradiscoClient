import type {
    EncryptedAttachmentAttributes,
    JsonApiResource,
    MessageAttributes,
    MessageResource,
    DirectMessageResource,
    DirectMessageAttributes,
    ReactionAttributes,
    ThreadAttributes,
    UserAttributes,
} from './types';
import { findIncluded, relationshipId, relationshipIds } from './types';
import type { MessageData, MessageReaction, MessageUser, ServerAttachment, ThreadPreview } from '@/types/chat';

function normalizeUser(resource: JsonApiResource<'users', UserAttributes> | undefined): MessageUser {
    if (!resource) {
        return { id: '', username: 'Unknown', avatar_urls: null };
    }
    return {
        id: resource.id,
        username: resource.attributes.display_name ?? resource.attributes.username,
        avatar_urls: resource.attributes.avatar_urls ?? null,
    };
}

function normalizeReaction(
    resource: JsonApiResource<'reactions', ReactionAttributes>,
    messageId: string,
): MessageReaction {
    return {
        id: resource.id,
        message_id: messageId,
        user_id: String(resource.attributes.user_id),
        emoji: resource.attributes.emoji,
    };
}

function normalizeAttachment(
    resource: JsonApiResource<'encrypted-attachments', EncryptedAttachmentAttributes>,
): ServerAttachment {
    return {
        id: resource.id,
        storage_path: '', // resolved via download endpoint
        encrypted_size: resource.attributes.encrypted_size,
        thumbnail_path: null,
        thumbnail_size: resource.attributes.thumbnail_size ?? null,
        status: resource.attributes.status ?? 'confirmed',
    };
}

function normalizeThreadPreview(
    resource: JsonApiResource<'threads', ThreadAttributes> | undefined,
    included: JsonApiResource[] | undefined,
): ThreadPreview | null {
    if (!resource) return null;

    const latestReplyId = relationshipId(resource.relationships?.latestReply);
    let lastReply: ThreadPreview['last_reply'] = null;

    if (latestReplyId) {
        const replyRes = findIncluded<MessageResource>(included, 'messages', latestReplyId);
        if (replyRes) {
            const replyUserId = relationshipId(replyRes.relationships?.user);
            const replyUserRes = replyUserId
                ? findIncluded<JsonApiResource<'users', UserAttributes>>(included, 'users', replyUserId)
                : undefined;
            lastReply = {
                id: replyRes.id,
                content: replyRes.attributes.content,
                user: normalizeUser(replyUserRes),
                created_at: replyRes.attributes.created_at,
                sender_device_id: replyRes.attributes.sender_device_id,
            };
        }
    }

    return {
        id: resource.id,
        message_count: resource.attributes.message_count,
        last_message_at: resource.attributes.last_message_at,
        is_following: resource.attributes.is_following,
        last_reply: lastReply,
    };
}

/**
 * Normalize a JSON:API MessageResource (channel or DM) into a flat MessageData object.
 */
export function normalizeMessage(
    resource: MessageResource | DirectMessageResource,
    included: JsonApiResource[] | undefined,
): MessageData {
    const attrs = resource.attributes as MessageAttributes & DirectMessageAttributes;
    const rels = resource.relationships ?? {};

    // User
    const userId = relationshipId(rels.user);
    const userRes = userId
        ? findIncluded<JsonApiResource<'users', UserAttributes>>(included, 'users', userId)
        : undefined;

    // Reactions
    const reactionIds = relationshipIds(rels.reactions);
    const reactions: MessageReaction[] = reactionIds
        .map((rid) => findIncluded<JsonApiResource<'reactions', ReactionAttributes>>(included, 'reactions', rid))
        .filter((r): r is JsonApiResource<'reactions', ReactionAttributes> => !!r)
        .map((r) => normalizeReaction(r, resource.id));

    // ReplyTo
    const replyToId = relationshipId(rels.replyTo);
    let replyTo: MessageData['reply_to'] = null;
    if (replyToId) {
        const replyType = resource.type === 'direct-messages' ? 'direct-messages' : 'messages';
        const replyRes = findIncluded<MessageResource | DirectMessageResource>(included, replyType, replyToId);
        if (replyRes) {
            const replyUserId = relationshipId(replyRes.relationships?.user);
            const replyUserRes = replyUserId
                ? findIncluded<JsonApiResource<'users', UserAttributes>>(included, 'users', replyUserId)
                : undefined;
            replyTo = {
                id: replyRes.id,
                content: (replyRes.attributes as MessageAttributes).content,
                user: normalizeUser(replyUserRes),
            };
        }
    }

    // Thread (channel messages only)
    let thread: ThreadPreview | null = null;
    if ('threadStarted' in rels) {
        const threadId = relationshipId(rels.threadStarted);
        if (threadId) {
            const threadRes = findIncluded<JsonApiResource<'threads', ThreadAttributes>>(included, 'threads', threadId);
            thread = normalizeThreadPreview(threadRes, included);
        }
    }

    // Encrypted attachments
    const attachmentIds = relationshipIds(rels.encryptedAttachments);
    const encrypted_attachments: ServerAttachment[] = attachmentIds
        .map((aid) =>
            findIncluded<JsonApiResource<'encrypted-attachments', EncryptedAttachmentAttributes>>(
                included,
                'encrypted-attachments',
                aid,
            ),
        )
        .filter((a): a is JsonApiResource<'encrypted-attachments', EncryptedAttachmentAttributes> => !!a)
        .map(normalizeAttachment);

    return {
        id: resource.id,
        content: attrs.content,
        is_edited: attrs.is_edited ?? false,
        edited_at: attrs.edited_at ?? null,
        deleted_at: attrs.deleted_at ?? null,
        reply_to_id: attrs.reply_to_id ?? null,
        thread_id: (attrs as MessageAttributes).thread_id ?? null,
        thread,
        reply_to: replyTo,
        user: normalizeUser(userRes),
        reactions,
        created_at: attrs.created_at,
        is_pinned: attrs.is_pinned ?? false,
        pinned_at: attrs.pinned_at ?? null,
        sender_device_id: attrs.sender_device_id,
        encrypted_attachments: encrypted_attachments.length > 0 ? encrypted_attachments : undefined,
    };
}

/**
 * Normalize a collection of JSON:API message resources into flat MessageData[].
 */
export function normalizeMessages(
    resources: (MessageResource | DirectMessageResource)[],
    included: JsonApiResource[] | undefined,
): MessageData[] {
    return resources.map((r) => normalizeMessage(r, included));
}

/**
 * Coerce all IDs in a broadcast MessageData event to strings.
 * Broadcast events send numeric IDs from PHP; the client expects strings.
 */
export function coerceBroadcastMessage(msg: MessageData): MessageData {
    msg.id = String(msg.id);
    if (msg.user) {
        msg.user.id = String(msg.user.id);
    }
    if (msg.reply_to_id != null) {
        msg.reply_to_id = String(msg.reply_to_id);
    }
    if (msg.thread_id != null) {
        msg.thread_id = String(msg.thread_id);
    }
    if (msg.reply_to) {
        msg.reply_to.id = String(msg.reply_to.id);
        if (msg.reply_to.user) {
            msg.reply_to.user.id = String(msg.reply_to.user.id);
        }
    }
    if (msg.reactions) {
        for (const r of msg.reactions) {
            r.id = String(r.id);
            r.user_id = String(r.user_id);
            r.message_id = String(r.message_id);
        }
    }
    if (msg.thread) {
        msg.thread.id = String(msg.thread.id);
        if (msg.thread.last_reply) {
            msg.thread.last_reply.id = String(msg.thread.last_reply.id);
            if (msg.thread.last_reply.user) {
                msg.thread.last_reply.user.id = String(msg.thread.last_reply.user.id);
            }
        }
    }
    return msg;
}
