import { useInfiniteScroll, useResizeObserver, useScroll } from '@vueuse/core';
import { nextTick, shallowRef, watch } from 'vue';
import type { Ref } from 'vue';

interface UseMessageScrollOptions {
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

export function useMessageScroll(options: UseMessageScrollOptions) {
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

    const { arrivedState } = useScroll(containerRef, {
        offset: { bottom: 150, top: 100 },
        throttle: 50,
    });

    useResizeObserver(contentRef, () => {
        if (pinnedToBottom.value && containerRef.value) {
            containerRef.value.scrollTo({ top: containerRef.value.scrollHeight, behavior: 'smooth' });
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
            if (isLoadingOlder.value || !canLoadOlder.value) return;
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
            distance: 100,
            canLoadMore: () => canLoadOlder.value && !isLoadingOlder.value,
        },
    );

    useInfiniteScroll(
        containerRef,
        async () => {
            if (isLoadingNewer.value || !canLoadNewer.value) return;
            isLoadingNewer.value = true;
            try {
                await onLoadNewer();
            } finally {
                isLoadingNewer.value = false;
            }
        },
        {
            direction: 'bottom',
            distance: 100,
            canLoadMore: () => canLoadNewer.value && !isLoadingNewer.value,
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
        const el = containerRef.value;
        if (el) {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        }
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

    return {
        pinnedToBottom,
        unreadNewCount,
        isLoadingOlder,
        isLoadingNewer,
        jumpToBottom,
        jumpToMessage,
        notifyNewMessage,
    };
}
