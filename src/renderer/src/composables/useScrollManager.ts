import { useInfiniteScroll } from '@vueuse/core';
import { nextTick, shallowRef } from 'vue';
import type { Ref } from 'vue';
import type { MessageData } from '@/types/chat';

export function useScrollManager(
    containerRef: Ref<HTMLElement | null | undefined>,
    messages: Ref<MessageData[]>,
    canLoadMore: Ref<boolean>,
    onLoadOlder: () => Promise<void>,
) {
    const isLoadingMore = shallowRef(false);
    const isVisible = shallowRef(true);
    const userIsNearBottom = shallowRef(true);
    let revealTimer: ReturnType<typeof setTimeout> | null = null;
    let revealGeneration = 0;

    useInfiniteScroll(
        containerRef,
        async () => {
            if (isLoadingMore.value) return;
            isLoadingMore.value = true;
            const el = containerRef.value;
            const prevScrollHeight = el?.scrollHeight ?? 0;
            const prevScrollTop = el?.scrollTop ?? 0;

            await onLoadOlder();

            await nextTick();
            if (el) {
                const newScrollHeight = el.scrollHeight;
                el.scrollTop = newScrollHeight - prevScrollHeight + prevScrollTop;
            }
            isLoadingMore.value = false;
        },
        {
            direction: 'top',
            distance: 100,
            canLoadMore: () => canLoadMore.value,
        },
    );

    function checkIfNearBottom(): boolean {
        if (!containerRef.value) return true;
        const { scrollTop, scrollHeight, clientHeight } = containerRef.value;
        return scrollHeight - scrollTop - clientHeight < 150;
    }

    function scheduleReveal() {
        if (revealTimer !== null) clearTimeout(revealTimer);
        const gen = ++revealGeneration;
        revealTimer = setTimeout(() => {
            revealTimer = null;
            if (gen !== revealGeneration) return;
            requestAnimationFrame(() => {
                if (gen !== revealGeneration) return;
                if (containerRef.value) {
                    containerRef.value.scrollTop = containerRef.value.scrollHeight;
                }
                isVisible.value = true;
            });
        }, 150);
    }

    function scrollToBottom(force = false) {
        if (!isVisible.value && !force) return;
        if (messages.value.length === 0) return;
        if (!force && !userIsNearBottom.value) return;

        nextTick(() => {
            if (!containerRef.value) return;
            containerRef.value.scrollTop = containerRef.value.scrollHeight;
        });
    }

    function resetToBottom() {
        isVisible.value = false;
        userIsNearBottom.value = true;

        if (revealTimer !== null) {
            clearTimeout(revealTimer);
            revealTimer = null;
        }

        nextTick(() => {
            if (containerRef.value) {
                containerRef.value.scrollTop = containerRef.value.scrollHeight;
            }
            scheduleReveal();
        });
    }

    const handleScroll = () => {
        if (!containerRef.value) return;
        userIsNearBottom.value = checkIfNearBottom();
    };

    return {
        isLoadingMore,
        isVisible,
        scrollToBottom,
        resetToBottom,
        handleScroll,
    };
}
