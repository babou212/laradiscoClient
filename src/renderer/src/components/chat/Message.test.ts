import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import { useUsersStore } from '@/stores/users';
import type { MessageData, MessageReaction } from '@/types/chat';
import Message from './Message.vue';

// useRoute is the only router edge Message touches (for the copy-link computed).
const route = {
    name: 'chat',
    params: { channelId: 'chan-1' } as Record<string, string>,
    fullPath: '/channels/chan-1',
};
vi.mock('vue-router', () => ({
    useRoute: () => route,
}));

const CURRENT_USER_ID = 'me';

const stubs = {
    Avatar: { template: '<div><slot /></div>' },
    AvatarImage: true,
    AvatarFallback: { template: '<div><slot /></div>' },
    FileAttachment: { template: '<div data-attachment />' },
    MessageActions: true,
    MessageLinkPreview: { template: '<div data-link-preview />' },
    MessageReplyPreview: { template: '<div data-reply-preview />' },
    MessageYoutubeEmbed: { template: '<div data-youtube-embed />' },
    ThreadPreviewBadge: { template: '<div data-thread-badge />' },
};

function makeMessage(overrides: Partial<MessageData> = {}): MessageData {
    return {
        id: 'msg-1',
        content: 'hello world',
        is_edited: false,
        edited_at: null,
        deleted_at: null,
        reply_to_id: null,
        user: { id: 'author-1', username: 'author', avatar_urls: null },
        reactions: [],
        created_at: '2024-01-01T00:00:00.000Z',
        ...overrides,
    };
}

function reaction(emoji: string, userId: string): MessageReaction {
    return { id: `${emoji}-${userId}`, message_id: 'msg-1', user_id: userId, emoji };
}

function mountMessage(message: MessageData, props: Record<string, unknown> = {}) {
    return mount(Message, {
        props: {
            message,
            isEditing: false,
            editContent: '',
            showEmojiPicker: false,
            ...props,
        },
        global: { stubs },
    });
}

beforeEach(() => {
    const auth = useAuthStore();
    auth.$patch({ user: { id: CURRENT_USER_ID, username: 'me' } } as never);
});

describe('Message author rendering', () => {
    it('renders a tombstone for a deleted author', () => {
        const wrapper = mountMessage(makeMessage({ deleted_author_name: 'GhostUser' }));
        expect(wrapper.text()).toContain('GhostUser');
    });

    it('renders the store display name for a live author', () => {
        const users = useUsersStore();
        users.upsert({ id: 'author-1', username: 'author', display_name: 'Author Display' } as never);
        const wrapper = mountMessage(makeMessage());
        expect(wrapper.text()).toContain('Author Display');
    });
});

describe('Message status tags', () => {
    it('shows the pinned tag when the message is pinned', () => {
        const wrapper = mountMessage(makeMessage({ is_pinned: true }));
        expect(wrapper.text().toLowerCase()).toContain('pinned');
    });

    it('shows the edited tag when the message is edited', () => {
        const wrapper = mountMessage(makeMessage({ is_edited: true }));
        expect(wrapper.text().toLowerCase()).toContain('edited');
    });
});

describe('Message reply preview', () => {
    it('renders the reply preview when reply_to is present', () => {
        const wrapper = mountMessage(
            makeMessage({
                reply_to: {
                    id: 'msg-0',
                    content: 'original',
                    user: { id: 'author-1', username: 'author', avatar_urls: null },
                },
            }),
        );
        expect(wrapper.find('[data-reply-preview]').exists()).toBe(true);
    });

    it('does not render a reply preview otherwise', () => {
        const wrapper = mountMessage(makeMessage());
        expect(wrapper.find('[data-reply-preview]').exists()).toBe(false);
    });
});

describe('Message content branches', () => {
    it('renders markdown with mentions for plain text', () => {
        const wrapper = mountMessage(makeMessage({ content: 'hey @alice **bold**' }));
        const html = wrapper.find('.prose-chat').html();
        expect(html).toContain('data-mention="alice"');
        expect(html).toContain('<strong>bold</strong>');
    });

    it('renders a GIF image for a tenor/gif url', () => {
        const wrapper = mountMessage(makeMessage({ content: 'https://media.tenor.com/abc.gif' }));
        const img = wrapper.find('img[alt="GIF"]');
        expect(img.exists()).toBe(true);
        expect(img.attributes('src')).toBe('https://media.tenor.com/abc.gif');
    });

    it('renders a YouTube embed and strips the url from the text', () => {
        const wrapper = mountMessage(
            makeMessage({ content: 'watch this https://www.youtube.com/watch?v=dQw4w9WgXcQ now' }),
        );
        expect(wrapper.find('[data-youtube-embed]').exists()).toBe(true);
        // The url is stripped from the rendered body (it still survives in the
        // root's data-message-content snapshot attribute, so scope to .prose-chat).
        expect(wrapper.find('.prose-chat').html()).not.toContain('youtube.com/watch');
    });

    it('renders a link preview card and strips the previewed url from the text', () => {
        const wrapper = mountMessage(
            makeMessage({
                content: 'check https://example.com/article out',
                link_preview: {
                    url: 'https://example.com/article',
                    title: 'Example',
                    fetched_at: 0,
                },
            }),
        );
        expect(wrapper.find('[data-link-preview]').exists()).toBe(true);
        expect(wrapper.find('.prose-chat').html()).not.toContain('https://example.com/article');
    });
});

describe('Message attachments', () => {
    it('renders visible attachments', () => {
        const wrapper = mountMessage(
            makeMessage({
                attachments: [{ id: 'a1', file_name: 'f.png', mime_type: 'image/png', size: 1, has_thumbnail: false }],
            }),
        );
        expect(wrapper.findAll('[data-attachment]')).toHaveLength(1);
    });

    it('excludes the link-preview image from standalone attachments', () => {
        const wrapper = mountMessage(
            makeMessage({
                content: 'see https://example.com',
                link_preview: {
                    url: 'https://example.com',
                    title: 'Example',
                    fetched_at: 0,
                    image: { id: 'a1', mime_type: 'image/png', size: 1 },
                },
                attachments: [
                    { id: 'a1', file_name: 'f.png', mime_type: 'image/png', size: 1, has_thumbnail: false },
                    { id: 'a2', file_name: 'g.png', mime_type: 'image/png', size: 1, has_thumbnail: false },
                ],
            }),
        );
        expect(wrapper.findAll('[data-attachment]')).toHaveLength(1);
    });
});

describe('Message reactions', () => {
    it('groups reactions and counts them', () => {
        const wrapper = mountMessage(
            makeMessage({
                reactions: [reaction('👍', 'a'), reaction('👍', 'b'), reaction('🎉', 'c')],
            }),
        );
        const buttons = wrapper.findAll('button').filter((b) => b.text().includes('👍') || b.text().includes('🎉'));
        const thumbs = buttons.find((b) => b.text().includes('👍'));
        expect(thumbs?.text()).toContain('2');
    });

    it('emits toggleReaction with the emoji when a reaction is clicked', async () => {
        const wrapper = mountMessage(makeMessage({ reactions: [reaction('👍', 'a')] }), { canAddReactions: true });
        const thumbs = wrapper.findAll('button').find((b) => b.text().includes('👍'));
        await thumbs!.trigger('click');
        expect(wrapper.emitted('toggleReaction')?.[0]).toEqual(['👍']);
    });

    it('disables reaction buttons and does not emit when reactions are forbidden', async () => {
        const wrapper = mountMessage(makeMessage({ reactions: [reaction('👍', 'a')] }), { canAddReactions: false });
        const thumbs = wrapper.findAll('button').find((b) => b.text().includes('👍'));
        expect(thumbs!.attributes('disabled')).toBeDefined();
        await thumbs!.trigger('click');
        expect(wrapper.emitted('toggleReaction')).toBeFalsy();
    });
});

describe('Message editing', () => {
    it('renders an edit textarea bound to editContent when isEditing', () => {
        const wrapper = mountMessage(makeMessage(), { isEditing: true, editContent: 'draft' });
        const textarea = wrapper.find('textarea');
        expect(textarea.exists()).toBe(true);
        expect((textarea.element as HTMLTextAreaElement).value).toBe('draft');
    });

    it('emits updateEditContent on input', async () => {
        const wrapper = mountMessage(makeMessage(), { isEditing: true, editContent: 'draft' });
        await wrapper.find('textarea').setValue('changed');
        expect(wrapper.emitted('updateEditContent')?.[0]).toEqual(['changed']);
    });

    it('emits saveEdit on Enter (without shift) and cancelEdit on Escape', async () => {
        const wrapper = mountMessage(makeMessage(), { isEditing: true, editContent: 'draft' });
        const textarea = wrapper.find('textarea');
        await textarea.trigger('keydown', { key: 'Enter' });
        expect(wrapper.emitted('saveEdit')).toBeTruthy();
        await textarea.trigger('keydown', { key: 'Escape' });
        expect(wrapper.emitted('cancelEdit')).toBeTruthy();
    });

    it('does not render MessageActions while editing', () => {
        const wrapper = mountMessage(makeMessage(), { isEditing: true, editContent: 'draft' });
        expect(wrapper.findComponent({ name: 'MessageActions' }).exists()).toBe(false);
    });
});

describe('Message thread badge', () => {
    it('renders the thread badge when a thread exists and the thread button is enabled', () => {
        const wrapper = mountMessage(
            makeMessage({
                thread: { id: 't1', message_count: 2, last_message_at: '2024-01-01T00:00:00.000Z' },
            }),
        );
        expect(wrapper.find('[data-thread-badge]').exists()).toBe(true);
    });
});

describe('Message permission data attributes', () => {
    it('marks own messages as editable and deletable', () => {
        const wrapper = mountMessage(makeMessage({ user: { id: CURRENT_USER_ID, username: 'me', avatar_urls: null } }));
        const root = wrapper.find('[data-context-message]');
        expect(root.attributes('data-can-edit')).toBe('true');
        expect(root.attributes('data-can-delete')).toBe('true');
    });

    it('does not allow editing another user message without manage permission', () => {
        const wrapper = mountMessage(makeMessage());
        const root = wrapper.find('[data-context-message]');
        expect(root.attributes('data-can-edit')).toBe('false');
        expect(root.attributes('data-can-delete')).toBe('false');
    });
});
