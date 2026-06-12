import { useInfiniteScroll, useResizeObserver, useScroll } from '@vueuse/core';
import { nextTick, shallowRef, watch } from 'vue';
import type { Ref } from 'vue';

/**
 * Unified, non-virtualized chat scroll engine for the channel, DM and thread
 * message lists. Every loaded message is real DOM, so the browser owns layout
 * and there are no virtual-scroll estimate/anchor bugs.
 *
 * Behaviour (Discord-style):
 * - newest message sits at the bottom; the view stays pinned there as new
 *   messages arrive while the user is at the bottom;
 * - scrolling up near the top loads older messages and the viewport is kept
 *   visually fixed across the prepend (anchor preservation);
 * - while viewing history, scrolling down near the bottom loads newer messages;
 * - jump-to-message loads a window around the target if needed, then centers it.
 *
 * `containerRef` is the scroll element; `contentRef` is the inner wrapper whose
 * height changes (used to re-pin to the bottom as content grows/measures).
 */
interface UseChatScrollOptions {
    containerRef: Ref<HTMLElement | null | undefined>;
    contentRef: Ref<HTMLElement | null | undefined>;
    canLoadOlder: Ref<boolean>;
    canLoadNewer: Ref<boolean>;
    isViewingHistory: Ref<boolean>;
    onLoadOlder: () => Promise<void>;
    onLoadNewer: () => Promise<void>;
    onLoadAround: (messageId: string) => Promise<void>;
    onResetToLive: () => Promise<void>;
}

const BOTTOM_OFFSET = 120;
const TOP_OFFSET = 150;
const LOAD_DISTANCE = 200;

export function useChatScroll(options: UseChatScrollOptions) {
    const {
        containerRef,
        contentRef,
        canLoadOlder,
        canLoadNewer,
        isViewingHistory,
        onLoadOlder,
        onLoadNewer,
        onLoadAround,
        onResetToLive,
    } = options;

    const pinnedToBottom = shallowRef(true);
    const unreadNewCount = shallowRef(0);
    const isLoadingOlder = shallowRef(false);
    const isLoadingNewer = shallowRef(false);

    function scrollToBottom(behavior: ScrollBehavior = 'auto'): void {
        const el = containerRef.value;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior });
    }

    const { arrivedState } = useScroll(containerRef, {
        offset: { bottom: BOTTOM_OFFSET, top: TOP_OFFSET },
        throttle: 50,
    });

    // Keep the view pinned to the newest message as content height grows — new
    // messages arriving, images/attachments measuring, reactions toggling.
    // Instant (not smooth) to avoid jank on every height change. Skipped during
    // a prepend, which manages its own scroll position.
    useResizeObserver(contentRef, () => {
        if (pinnedToBottom.value && !isLoadingOlder.value) {
            scrollToBottom('auto');
        }
    });

    watch(
        () => arrivedState.bottom,
        (bottom) => {
            if (bottom) {
                if (!isViewingHistory.value) {
                    pinnedToBottom.value = true;
                    unreadNewCount.value = 0;
                }
            } else {
                pinnedToBottom.value = false;
            }
        },
    );

    // Load older (prepend) near the top, preserving the visual position: record
    // the scroll geometry before the prepend and restore it after the DOM grows.
    useInfiniteScroll(
        containerRef,
        async () => {
            if (isLoadingOlder.value || isLoadingNewer.value || !canLoadOlder.value) return;
            isLoadingOlder.value = true;
            const el = containerRef.value;
            const prevHeight = el?.scrollHeight ?? 0;
            const prevTop = el?.scrollTop ?? 0;
            try {
                await onLoadOlder();
                await nextTick();
                if (el) {
                    el.scrollTop = el.scrollHeight - prevHeight + prevTop;
                }
            } finally {
                isLoadingOlder.value = false;
            }
        },
        {
            direction: 'top',
            distance: LOAD_DISTANCE,
            canLoadMore: () => canLoadOlder.value && !isLoadingOlder.value,
        },
    );

    // Load newer (append) near the bottom — only meaningful while viewing
    // history (an `around`/jump window that isn't anchored to the live tail).
    useInfiniteScroll(
        containerRef,
        async () => {
            if (isLoadingNewer.value || isLoadingOlder.value || !canLoadNewer.value || !isViewingHistory.value) return;
            isLoadingNewer.value = true;
            try {
                await onLoadNewer();
            } finally {
                isLoadingNewer.value = false;
            }
        },
        {
            direction: 'bottom',
            distance: LOAD_DISTANCE,
            canLoadMore: () => canLoadNewer.value && isViewingHistory.value && !isLoadingNewer.value,
        },
    );

    function notifyNewMessage(): void {
        if (pinnedToBottom.value) return;
        unreadNewCount.value += 1;
    }

    async function jumpToBottom(): Promise<void> {
        if (isViewingHistory.value) {
            await onResetToLive();
            await nextTick();
        }
        pinnedToBottom.value = true;
        unreadNewCount.value = 0;
        scrollToBottom('smooth');
    }

    function highlightElement(el: HTMLElement): void {
        el.classList.add('message-highlight');
        setTimeout(() => el.classList.remove('message-highlight'), 2000);
    }

    function findMessageEl(id: string): HTMLElement | null {
        return containerRef.value?.querySelector<HTMLElement>(`[data-message-id="${id}"]`) ?? null;
    }

    async function jumpToMessage(messageId: string): Promise<void> {
        let el = findMessageEl(messageId);
        if (!el) {
            await onLoadAround(messageId);
            await nextTick();
            el = findMessageEl(messageId);
        }
        if (!el) return;

        pinnedToBottom.value = false;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        highlightElement(el);
    }

    // Reset pin/unread/loading state when switching conversation. The actual
    // scroll-to-bottom is driven by the resize observer once the new messages
    // render (pinnedToBottom is true), but we also assert it directly for the
    // case where height doesn't change between conversations.
    async function resetForNewConversation(): Promise<void> {
        pinnedToBottom.value = true;
        unreadNewCount.value = 0;
        isLoadingOlder.value = false;
        isLoadingNewer.value = false;
        await nextTick();
        scrollToBottom('auto');
    }

    return {
        pinnedToBottom,
        unreadNewCount,
        isLoadingOlder,
        isLoadingNewer,
        scrollToBottom,
        jumpToBottom,
        jumpToMessage,
        notifyNewMessage,
        resetForNewConversation,
    };
}
