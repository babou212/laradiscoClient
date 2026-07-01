import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageSearchResponse } from '@/api/search';
import type { MessageData } from '@/types/chat';
import SearchMessages from './SearchMessages.vue';

const searchChannelMessages = vi.fn();
const searchDmMessages = vi.fn();
vi.mock('@/api/search', () => ({
    searchChannelMessages: (...a: unknown[]) => searchChannelMessages(...a),
    searchDmMessages: (...a: unknown[]) => searchDmMessages(...a),
}));

const stubs = {
    SimpleTooltip: { template: '<div><slot /></div>' },
};

function msg(overrides: Partial<MessageData> = {}): MessageData {
    return {
        id: '11',
        content: 'first hit about cats',
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

function response(overrides: Partial<MessageSearchResponse> = {}): MessageSearchResponse {
    return {
        data: [msg()],
        meta: { current_page: 1, last_page: 1, total: 1, query: 'cats' },
        ...overrides,
    };
}

function mountSearch(props: Partial<{ conversationType: 'channel' | 'dm'; conversationId: number }> = {}) {
    return mount(SearchMessages, {
        props: {
            conversationType: props.conversationType ?? 'channel',
            conversationId: props.conversationId ?? 5,
            conversationName: 'general',
        },
        global: { stubs },
    });
}

/** The dialog is teleported to <body>, so query the live DOM rather than the wrapper. */
function input(): HTMLInputElement {
    return document.body.querySelector('input') as HTMLInputElement;
}

function buttonWithText(text: string): HTMLButtonElement | undefined {
    return Array.from(document.body.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(text)) as
        | HTMLButtonElement
        | undefined;
}

async function typeAndDebounce(query: string) {
    const el = input();
    el.value = query;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
}

beforeEach(() => {
    vi.useFakeTimers();
    searchChannelMessages.mockReset();
    searchDmMessages.mockReset();
});

afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
});

describe('SearchMessages base UI', () => {
    it('renders the conversation name in the title and a prompt before searching', () => {
        mountSearch();
        expect(document.body.textContent).toContain('Search in general');
        expect(document.body.textContent).toContain('Type to search messages');
    });
});

describe('SearchMessages querying', () => {
    it('calls the channel search endpoint with the debounced query', async () => {
        searchChannelMessages.mockResolvedValue(response());
        mountSearch({ conversationType: 'channel', conversationId: 5 });
        await typeAndDebounce('cats');
        expect(searchChannelMessages).toHaveBeenCalledWith(5, 'cats', 1, 30);
        expect(searchDmMessages).not.toHaveBeenCalled();
    });

    it('calls the dm search endpoint for dm conversations', async () => {
        searchDmMessages.mockResolvedValue(response());
        mountSearch({ conversationType: 'dm', conversationId: 9 });
        await typeAndDebounce('cats');
        expect(searchDmMessages).toHaveBeenCalledWith(9, 'cats', 1, 30);
    });

    it('does not search for a blank query', async () => {
        mountSearch();
        await typeAndDebounce('   ');
        expect(searchChannelMessages).not.toHaveBeenCalled();
    });

    it('renders each result with author name and rendered message body', async () => {
        searchChannelMessages.mockResolvedValue(response());
        mountSearch();
        await typeAndDebounce('cats');
        expect(document.body.textContent).toContain('alice');
        expect(document.body.textContent).toContain('first hit about cats');
    });

    it('shows the no-results state when the search returns nothing', async () => {
        searchChannelMessages.mockResolvedValue(
            response({ data: [], meta: { current_page: 1, last_page: 1, total: 0, query: 'cats' } }),
        );
        mountSearch();
        await typeAndDebounce('cats');
        expect(document.body.textContent).toContain('No results found');
    });

    it('shows an error message when the search rejects', async () => {
        searchChannelMessages.mockRejectedValue(new Error('boom'));
        mountSearch();
        await typeAndDebounce('cats');
        expect(document.body.textContent).toContain('Search failed');
    });
});

describe('SearchMessages pagination', () => {
    it('shows a load-more button and fetches the next page', async () => {
        searchChannelMessages.mockResolvedValueOnce(
            response({ meta: { current_page: 1, last_page: 2, total: 2, query: 'cats' } }),
        );
        mountSearch({ conversationType: 'channel', conversationId: 5 });
        await typeAndDebounce('cats');

        const loadMore = buttonWithText('Load more');
        expect(loadMore).toBeTruthy();

        searchChannelMessages.mockResolvedValueOnce(
            response({
                data: [msg({ id: '22', content: 'second page hit', user: { id: '8', username: 'bob', avatar_urls: null } })],
                meta: { current_page: 2, last_page: 2, total: 2, query: 'cats' },
            }),
        );
        loadMore!.click();
        await flushPromises();

        expect(searchChannelMessages).toHaveBeenLastCalledWith(5, 'cats', 2, 30);
        expect(document.body.textContent).toContain('second page hit');
    });

    it('does not show load-more on the last page', async () => {
        searchChannelMessages.mockResolvedValue(response());
        mountSearch();
        await typeAndDebounce('cats');
        expect(buttonWithText('Load more')).toBeUndefined();
    });
});

describe('SearchMessages emits', () => {
    it('emits navigateToMessage with the message id and no thread when a channel result is clicked', async () => {
        searchChannelMessages.mockResolvedValue(response());
        const wrapper = mountSearch();
        await typeAndDebounce('cats');
        buttonWithText('first hit about cats')!.click();
        await flushPromises();
        expect(wrapper.emitted('navigateToMessage')?.[0]).toEqual([{ messageId: 11, threadId: null }]);
    });

    it('emits navigateToMessage with the thread id when a thread reply result is clicked', async () => {
        searchChannelMessages.mockResolvedValue(response({ data: [msg({ thread_id: '99' })] }));
        const wrapper = mountSearch();
        await typeAndDebounce('cats');
        buttonWithText('first hit about cats')!.click();
        await flushPromises();
        expect(wrapper.emitted('navigateToMessage')?.[0]).toEqual([{ messageId: 11, threadId: '99' }]);
    });

    it('emits close when the overlay is clicked', async () => {
        const wrapper = mountSearch();
        const overlay = document.body.querySelector('.bg-black\\/50') as HTMLElement;
        overlay.dispatchEvent(new Event('mousedown', { bubbles: true }));
        await flushPromises();
        expect(wrapper.emitted('close')).toBeTruthy();
    });
});
