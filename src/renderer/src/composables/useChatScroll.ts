import { useInfiniteScroll, useResizeObserver, useScroll } from '@vueuse/core';
import { nextTick, shallowRef, watch } from 'vue';
import type { Ref } from 'vue';

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

    function distanceFromBottom(el: HTMLElement): number {
        return el.scrollHeight - el.scrollTop - el.clientHeight;
    }

    function waitForScrollSettle(el: HTMLElement): Promise<void> {
        return new Promise((resolve) => {
            let timer: ReturnType<typeof setTimeout>;
            const finish = (): void => {
                el.removeEventListener('scroll', onScroll);
                resolve();
            };
            const onScroll = (): void => {
                clearTimeout(timer);
                timer = setTimeout(finish, 100);
            };
            el.addEventListener('scroll', onScroll, { passive: true });
            timer = setTimeout(finish, 100);
        });
    }

    async function jumpToMessage(messageId: string): Promise<void> {
        let el = findMessageEl(messageId);
        if (!el) {
            await onLoadAround(messageId);
            await nextTick();
            el = findMessageEl(messageId);
        }
        if (!el) return;

        const container = containerRef.value;

        if (container) {
            const elTopInContent = container.scrollTop + (el.getBoundingClientRect().top - container.getBoundingClientRect().top);
            const desired = elTopInContent + el.clientHeight / 2 - container.clientHeight / 2;
            const maxScroll = container.scrollHeight - container.clientHeight;
            const finalScrollTop = Math.max(0, Math.min(desired, maxScroll));
            pinnedToBottom.value = maxScroll - finalScrollTop <= BOTTOM_OFFSET;
        }

        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        highlightElement(el);

        if (container) {
            await waitForScrollSettle(container);
            pinnedToBottom.value = distanceFromBottom(container) <= BOTTOM_OFFSET;
        }
    }

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
