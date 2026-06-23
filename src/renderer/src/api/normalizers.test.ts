import { describe, expect, it } from 'vitest';
import {
    attachmentResource,
    messageResource,
    reactionResource,
    rel,
    relMany,
    threadResource,
    userResource,
} from '@/../../../test/helpers/jsonapi';
import type { MessageData } from '@/types/chat';
import { coerceBroadcastMessage, normalizeMessage, normalizeMessages } from './normalizers';
import type { JsonApiResource, MessageResource } from './types';

describe('normalizeMessage', () => {
    it('resolves the message author from included users', () => {
        const msg = messageResource('1', { content: 'hi' }, { user: rel('users', 'u1') });
        const included = [userResource('u1', { username: 'alice', display_name: 'Alice A' })];
        const out = normalizeMessage(msg, included);
        expect(out.user.username).toBe('Alice A'); // display_name preferred
        expect(out.user.id).toBe('u1');
        expect(out.content).toBe('hi');
    });

    it('falls back to Unknown when the user is missing', () => {
        const out = normalizeMessage(messageResource('1', {}, { user: rel('users', 'gone') }), []);
        expect(out.user.username).toBe('Unknown');
    });

    it('hydrates reactions and attachments from included', () => {
        const msg = messageResource(
            '5',
            {},
            { reactions: relMany('reactions', ['r1', 'r2']), attachments: relMany('attachments', ['a1']) },
        );
        const included = [
            reactionResource('r1', 7, '👍'),
            reactionResource('r2', 8, '🎉'),
            attachmentResource('a1', { file_name: 'pic.png' }),
        ];
        const out = normalizeMessage(msg, included);
        expect(out.reactions).toHaveLength(2);
        expect(out.reactions[0]).toMatchObject({ emoji: '👍', user_id: '7', message_id: '5' });
        expect(out.attachments).toHaveLength(1);
        expect(out.attachments?.[0].file_name).toBe('pic.png');
    });

    it('resolves a reply-to message', () => {
        const msg = messageResource('9', { reply_to_id: '3' }, { replyTo: rel('messages', '3') });
        const included = [
            messageResource('3', { content: 'parent' }, { user: rel('users', 'u2') }),
            userResource('u2'),
        ] as unknown as JsonApiResource[];
        const out = normalizeMessage(msg, included);
        expect(out.reply_to?.id).toBe('3');
        expect(out.reply_to?.content).toBe('parent');
    });

    it('builds a thread preview from threadStarted', () => {
        const msg = messageResource('11', {}, { threadStarted: rel('threads', 't1') });
        const included = [threadResource('t1', { message_count: 4 })];
        const out = normalizeMessage(msg, included);
        expect(out.thread?.id).toBe('t1');
        expect(out.thread?.message_count).toBe(4);
    });

    it('defaults flags when attributes are absent', () => {
        const out = normalizeMessage(messageResource('1'), []);
        expect(out.is_edited).toBe(false);
        expect(out.is_pinned).toBe(false);
        expect(out.attachments).toBeUndefined();
    });
});

describe('normalizeMessages', () => {
    it('maps a collection', () => {
        const out = normalizeMessages([messageResource('1'), messageResource('2')], []);
        expect(out.map((m) => m.id)).toEqual(['1', '2']);
    });
});

describe('coerceBroadcastMessage', () => {
    it('coerces all numeric ids to strings, deeply', () => {
        const msg = {
            id: 1,
            user: { id: 2, username: 'a', avatar_urls: null },
            reply_to_id: 3,
            thread_id: 4,
            reply_to: { id: 5, user: { id: 6 } },
            reactions: [{ id: 7, user_id: 8, message_id: 9, emoji: '👍' }],
            thread: { id: 10, last_reply: { id: 11, user: { id: 12 } } },
            attachments: [{ id: 13 }],
        } as unknown as MessageData;

        const out = coerceBroadcastMessage(msg);
        expect(out.id).toBe('1');
        expect(out.user!.id).toBe('2');
        expect(out.reply_to_id).toBe('3');
        expect(out.thread_id).toBe('4');
        expect(out.reply_to!.id).toBe('5');
        expect(out.reply_to!.user!.id).toBe('6');
        expect(out.reactions![0]).toMatchObject({ id: '7', user_id: '8', message_id: '9' });
        expect(out.thread!.id).toBe('10');
        expect(out.thread!.last_reply!.id).toBe('11');
        expect(out.thread!.last_reply!.user!.id).toBe('12');
        expect(out.attachments![0].id).toBe('13');
    });
});

// Type guard so the fixture helper return type lines up with normalizeMessage.
const _typecheck: MessageResource = messageResource('1');
void _typecheck;
