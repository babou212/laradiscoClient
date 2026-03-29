import { elementScroll, useVirtualizer, type VirtualizerOptions } from '@tanstack/vue-virtual';
import { computed, nextTick, onMounted, shallowRef, watch } from 'vue';
import type { Ref, ShallowRef } from 'vue';
import type { MessageData } from '@/types/chat';

export function useScrollManager(
    containerRef: Ref<HTMLElement | null | undefined>,
    messages: Ref<MessageData[]>,
    virtualItemEls: ShallowRef<Element[]>,
    onLoadOlder: () => Promise<void>,
) {
    const isLoadingMore = shallowRef(false);
    const isVisible = shallowRef(true);
    const userIsNearBottom = shallowRef(true);
    let revealTimer: ReturnType<typeof setTimeout> | null = null;
    let loadCooldown = false;
    const scrollingRef = shallowRef<number>();

    const easeInOutQuint = (t: number) => (t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t);

    const scrollToFn: VirtualizerOptions<HTMLElement, Element>['scrollToFn'] = (offset, canSmooth, instance) => {
        if (!canSmooth) {
            elementScroll(offset, canSmooth, instance);
            return;
        }
        const duration = 300;
        const start = containerRef.value?.scrollTop ?? 0;
        const startTime = (scrollingRef.value = Date.now());

        const run = () => {
            if (scrollingRef.value !== startTime) return;
            const now = Date.now();
            const elapsed = now - startTime;
            const progress = easeInOutQuint(Math.min(elapsed / duration, 1));
            const interpolated = start + (offset - start) * progress;
            elementScroll(interpolated, canSmooth, instance);
            if (elapsed < duration) {
                requestAnimationFrame(run);
            }
        };

        requestAnimationFrame(run);
    };

    const virtualizerOptions = computed(() => ({
        count: messages.value.length,
        getScrollElement: () => containerRef.value ?? null,
        estimateSize: () => 80,
        overscan: 15,
        scrollToFn,
    }));

    const rowVirtualizer = useVirtualizer(virtualizerOptions);
    const virtualItems = computed(() => rowVirtualizer.value.getVirtualItems());
    const totalSize = computed(() => rowVirtualizer.value.getTotalSize());

    function measureAll() {
        rowVirtualizer.value.measureElement(null);
        virtualItemEls.value.forEach((el) => {
            if (el) rowVirtualizer.value.measureElement(el);
        });
    }

    onMounted(measureAll);

    watch(
        totalSize,
        () => {
            if (!isVisible.value && containerRef.value) {
                containerRef.value.scrollTop = containerRef.value.scrollHeight;
                scheduleReveal();
            }
        },
        { flush: 'post' },
    );

    function checkIfNearBottom(): boolean {
        if (!containerRef.value) return true;
        const { scrollTop, scrollHeight, clientHeight } = containerRef.value;
        return scrollHeight - scrollTop - clientHeight < 150;
    }

    function scheduleReveal() {
        if (revealTimer !== null) clearTimeout(revealTimer);
        revealTimer = setTimeout(() => {
            revealTimer = null;
            if (containerRef.value) {
                containerRef.value.scrollTop = containerRef.value.scrollHeight;
            }
            isVisible.value = true;
        }, 50);
    }

    function scrollToBottom(force = false) {
        if (!isVisible.value && !force) return;

        const lastIndex = messages.value.length - 1;
        if (lastIndex < 0) return;
        if (!force && !userIsNearBottom.value) return;

        scrollingRef.value = -1;

        if (force) {
            if (containerRef.value) {
                containerRef.value.scrollTop = containerRef.value.scrollHeight;
            }
        } else {
            nextTick(() => {
                if (!containerRef.value) return;
                rowVirtualizer.value.scrollToIndex(lastIndex, { align: 'end' });
            });
        }
    }

    function resetToBottom() {
        isVisible.value = false;
        userIsNearBottom.value = true;
        scrollingRef.value = -1;

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

    const handleScroll = async () => {
        if (!containerRef.value) return;

        scrollingRef.value = -1;
        userIsNearBottom.value = checkIfNearBottom();

        if (isLoadingMore.value || loadCooldown) return;

        if (containerRef.value.scrollTop < 100) {
            isLoadingMore.value = true;
            const prevScrollHeight = containerRef.value.scrollHeight;
            const prevScrollTop = containerRef.value.scrollTop;

            await onLoadOlder();

            await nextTick();
            if (containerRef.value) {
                const newScrollHeight = containerRef.value.scrollHeight;
                containerRef.value.scrollTop = newScrollHeight - prevScrollHeight + prevScrollTop;
            }
            isLoadingMore.value = false;

            loadCooldown = true;
            setTimeout(() => {
                loadCooldown = false;
            }, 500);
        }
    };

    return {
        rowVirtualizer,
        virtualItems,
        totalSize,
        isLoadingMore,
        isVisible,
        scrollToBottom,
        resetToBottom,
        handleScroll,
    };
}
