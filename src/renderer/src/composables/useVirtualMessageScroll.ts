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

const PROGRAMMATIC_SCROLL_GUARD_MS = 200;

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

    let isProgrammaticScroll = false;
    let programmaticScrollTimer = 0;

    function beginProgrammaticScroll(durationMs = PROGRAMMATIC_SCROLL_GUARD_MS): void {
        isProgrammaticScroll = true;
        clearTimeout(programmaticScrollTimer);
        programmaticScrollTimer = window.setTimeout(() => {
            isProgrammaticScroll = false;
        }, durationMs);
    }

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

        if (offset < LOAD_TRIGGER_OFFSET && !isLoadingOlder.value && canLoadOlder.value) {
            triggerLoadOlder();
        }

        if (isViewingHistory.value && canLoadNewer.value && !isLoadingNewer.value) {
            const distFromBottom = vlist.scrollSize - offset - vlist.viewportSize;
            if (distFromBottom < LOAD_TRIGGER_OFFSET) {
                triggerLoadNewer();
            }
        }
    }

    async function triggerLoadOlder(): Promise<void> {
        if (isLoadingOlder.value || !canLoadOlder.value) return;
        isLoadingOlder.value = true;
        isPrepend.value = true;
        try {
            await onLoadOlder();
            await nextTick();
        } finally {
            isLoadingOlder.value = false;
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
            const el = document.querySelector<HTMLElement>(`[data-message-id="${messageId}"]`);
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

    let scrollToEndTimer = 0;

    function scheduleScrollToEnd(): void {
        clearTimeout(scrollToEndTimer);
        let attempts = 0;
        const maxAttempts = 20;

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
