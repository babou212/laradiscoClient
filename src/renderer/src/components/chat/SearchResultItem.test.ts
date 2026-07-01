import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { MessageData } from '@/types/chat';
import SearchResultItem from './SearchResultItem.vue';

const stubs = {
    MessageYoutubeEmbed: { template: '<div data-test="youtube" />' },
    MessageLinkPreview: { template: '<div data-test="link-preview" />' },
    FileAttachment: { props: ['attachment'], template: '<div data-test="attachment">{{ attachment.file_name }}</div>' },
};

function msg(overrides: Partial<MessageData> = {}): MessageData {
    return {
        id: '11',
        content: 'hello world',
        is_edited: false,
        edited_at: null,
        deleted_at: null,
        reply_to_id: null,
        user: { id: '7', username: 'alice', avatar_urls: null },
        reactions: [],
        created_at: '2026-06-23T10:00:00Z',
        ...overrides,
    };
}

function mountItem(message: MessageData) {
    return mount(SearchResultItem, { props: { message }, global: { stubs } });
}

describe('SearchResultItem', () => {
    it('renders the author name and message body', () => {
        const w = mountItem(msg());
        expect(w.text()).toContain('alice');
        expect(w.html()).toContain('hello world');
    });

    it('shows the author initial when there is no avatar', () => {
        const w = mountItem(msg());
        expect(w.text()).toContain('A');
    });

    it('renders a YouTube embed for a youtube link', () => {
        const w = mountItem(msg({ content: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }));
        expect(w.find('[data-test="youtube"]').exists()).toBe(true);
    });

    it('renders a link preview card when present', () => {
        const w = mountItem(
            msg({ content: 'see https://ex.com/a', link_preview: { url: 'https://ex.com/a', title: 't', fetched_at: 0 } }),
        );
        expect(w.find('[data-test="link-preview"]').exists()).toBe(true);
    });

    it('renders file attachments', () => {
        const w = mountItem(
            msg({
                content: '',
                attachments: [{ id: 'a1', file_name: 'doc.pdf', mime_type: 'application/pdf', size: 1, has_thumbnail: false }],
            }),
        );
        expect(w.find('[data-test="attachment"]').text()).toContain('doc.pdf');
    });

    it('renders a GIF inline', () => {
        const w = mountItem(msg({ content: 'https://media.tenor.com/x.gif' }));
        expect(w.find('img[alt="GIF"]').exists()).toBe(true);
    });

    it('falls back to the deleted author name', () => {
        const w = mountItem(msg({ deleted_author_name: 'Ghost' }));
        expect(w.text()).toContain('Ghost');
    });

    it('emits jump when clicked', async () => {
        const w = mountItem(msg());
        await w.find('button').trigger('click');
        expect(w.emitted('jump')).toBeTruthy();
    });
});
