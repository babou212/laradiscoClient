import type { VListHandle } from 'virtua/vue';
import { nextTick, shallowRef, watch } from 'vue';
import type { Ref } from 'vue';
import type { MessageData } from '@/types/chat';

interface UseVirtualMessageScrollOptions {
    vlistRef: Ref<VListHandle | null>;
    messages: Ref<MessageData[]>;
    canLoadOlder: Ref<boolean>;
    canLoadNewer: Ref<boolean>;
    isViewingHistory: Ref<boolean>;
    onLoadOlder: () => Promise<void>;
    onLoadNewer: () => Promise<void>;
    onLoadAround: (messageId: string) => Promise<void>;
    onResetToLive: () => Promise<void>;
}

const BOTTOM_THRESHOLD = 150;
const LOAD_TRIGGER_OFFSET = 400;

// How long to suppress unpin after a programmatic scroll.
// Virtua's scrollToIndex triggers multiple scroll events across frames
// as items are measured and positions adjust — a single rAF is not enough.
const PROGRAMMATIC_SCROLL_GUARD_MS = 200;

/**
 * Virtual message scroll using virtua's VList component.
 *
 * The VList component handles all virtualization and DOM positioning.
 * This composable coordinates scroll behavior: pin-to-bottom, infinite
 * loading, jump-to-message, and prepend anchoring via VList's shift prop.
 */
export function useVirtualMessageScroll(options: UseVirtualMessageScrollOptions) {
    const {
        vlistRef,
        messages,
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
    const isPrepend = shallowRef(false);

    // Guard: suppress unpin during programmatic scrolls.
    // Virtua fires multiple scroll events as it measures and repositions items
    // after scrollToIndex, so we use a timer rather than a single rAF.
    let isProgrammaticScroll = false;
    let programmaticScrollTimer = 0;

    function beginProgrammaticScroll(durationMs = PROGRAMMATIC_SCROLL_GUARD_MS): void {
        isProgrammaticScroll = true;
        clearTimeout(programmaticScrollTimer);
        programmaticScrollTimer = window.setTimeout(() => {
            isProgrammaticScroll = false;
        }, durationMs);
    }

    // --- onScroll handler: bound to VList @scroll ---

    function onScroll(offset: number): void {
        const vlist = vlistRef.value;
        if (!vlist) return;

        const atBottom = offset - vlist.scrollSize + vlist.viewportSize >= -BOTTOM_THRESHOLD;

        if (atBottom) {
            if (!isViewingHistory.value) {
                pinnedToBottom.value = true;
                unreadNewCount.value = 0;
            }
        } else if (!isProgrammaticScroll && pinnedToBottom.value) {
            pinnedToBottom.value = false;
        }

        // Infinite scroll: load older when near top
        if (offset < LOAD_TRIGGER_OFFSET && !isLoadingOlder.value && canLoadOlder.value) {
            triggerLoadOlder();
        }

        // Infinite scroll: load newer when near bottom (history mode only)
        if (isViewingHistory.value && canLoadNewer.value && !isLoadingNewer.value) {
            const distFromBottom = vlist.scrollSize - offset - vlist.viewportSize;
            if (distFromBottom < LOAD_TRIGGER_OFFSET) {
                triggerLoadNewer();
            }
        }
    }

    // --- Infinite scroll triggers ---

    async function triggerLoadOlder(): Promise<void> {
        if (isLoadingOlder.value || !canLoadOlder.value) return;
        isLoadingOlder.value = true;
        isPrepend.value = true;
        try {
            await onLoadOlder();
            await nextTick();
        } finally {
            isLoadingOlder.value = false;
            // Keep shift active briefly so VList processes the layout shift,
            // then disable after two frames to let measurements settle.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    isPrepend.value = false;
                });
            });
        }
    }

    async function triggerLoadNewer(): Promise<void> {
        if (isLoadingNewer.value || !canLoadNewer.value) return;
        isLoadingNewer.value = true;
        try {
            await onLoadNewer();
            await nextTick();
        } finally {
            isLoadingNewer.value = false;
        }
    }

    watch(
        () => messages.value.length,
        (newLen, oldLen) => {
            if (newLen > oldLen && pinnedToBottom.value && !isLoadingOlder.value) {
                nextTick(() => {
                    beginProgrammaticScroll();
                    vlistRef.value?.scrollToIndex(newLen - 1, { align: 'end' });
                });
            }
        },
        { flush: 'post' },
    );

    function scrollToBottom(behavior: ScrollBehavior = 'auto'): void {
        const len = messages.value.length;
        if (len === 0) return;
        const smooth = behavior === 'smooth';
        beginProgrammaticScroll(smooth ? 500 : PROGRAMMATIC_SCROLL_GUARD_MS);
        vlistRef.value?.scrollToIndex(len - 1, { align: 'end', smooth });
    }

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

    async function jumpToMessage(messageId: string): Promise<void> {
        let msgIdx = messages.value.findIndex((m) => m.id === messageId);

        if (msgIdx === -1) {
            await onLoadAround(messageId);
            await nextTick();
            msgIdx = messages.value.findIndex((m) => m.id === messageId);
        }
        if (msgIdx === -1) return;

        pinnedToBottom.value = false;
        vlistRef.value?.scrollToIndex(msgIdx, { align: 'center', smooth: true });

        setTimeout(() => {
            const el = document.querySelector<HTMLElement>(
                `[data-message-id="${messageId}"]`,
            );
            if (el) {
                el.classList.add('message-highlight');
                setTimeout(() => el.classList.remove('message-highlight'), 2000);
            }
        }, 300);
    }

    function scrollToEnd(): void {
        const len = messages.value.length;
        if (len === 0) return;
        beginProgrammaticScroll();
        vlistRef.value?.scrollToIndex(len - 1, { align: 'end' });
    }

    // Retry scrollToEnd until VList is mounted and has a non-zero scrollSize.
    // Covers fresh mount (settings → channel) where VList isn't in the DOM yet
    // when resetScroll fires, and also cases where VList is mounted but hasn't
    // measured items yet (scrollSize === 0).
    let scrollToEndTimer = 0;

    function scheduleScrollToEnd(): void {
        clearTimeout(scrollToEndTimer);
        let attempts = 0;
        const maxAttempts = 20; // 20 × 16ms ≈ 320ms max

        function tryScroll(): void {
            attempts++;
            const vlist = vlistRef.value;
            if (vlist && vlist.scrollSize > 0) {
                scrollToEnd();
                return;
            }
            if (attempts < maxAttempts) {
                scrollToEndTimer = window.setTimeout(tryScroll, 16);
            }
        }

        tryScroll();
    }

    function resetScroll(): void {
        pinnedToBottom.value = true;
        unreadNewCount.value = 0;
        isPrepend.value = false;
        scheduleScrollToEnd();
    }

    return {
        pinnedToBottom,
        unreadNewCount,
        isLoadingOlder,
        isLoadingNewer,
        isPrepend,
        onScroll,
        jumpToBottom,
        jumpToMessage,
        notifyNewMessage,
        scrollToBottom,
        resetScroll,
    };
}
