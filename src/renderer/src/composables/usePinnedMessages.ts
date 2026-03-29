import { ref, shallowRef } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { useE2EE } from '@/composables/useE2EE';
import api from '@/lib/api';
import { useE2eeStore } from '@/stores/e2ee';
import type { MessageData } from '@/types/chat';

export function usePinnedMessages(
    channelId: Ref<number | undefined>,
    isDm: Ref<boolean>,
    activeMessages: ComputedRef<MessageData[]>,
) {
    const e2eeStore = useE2eeStore();
    const e2ee = useE2EE();

    const pinnedMessages = ref<MessageData[]>([]);
    const showPinnedMessages = shallowRef(false);
    const isLoadingPinned = shallowRef(false);

    async function fetchPinnedMessages(): Promise<void> {
        if (!channelId.value) return;
        isLoadingPinned.value = true;
        try {
            const endpoint = isDm.value
                ? `/direct-messages/${channelId.value}/pins`
                : `/channels/${channelId.value}/pins`;
            const response = await api.get(endpoint);
            pinnedMessages.value = response.data ?? [];
        } catch (error) {
            console.error('Failed to fetch pinned messages:', error);
        } finally {
            isLoadingPinned.value = false;
        }
    }

    async function fetchAndDecryptPinned(): Promise<void> {
        await fetchPinnedMessages();
        if (e2eeStore.isReady && pinnedMessages.value.length > 0) {
            const chId = isDm.value ? undefined : channelId.value;
            const dmId = isDm.value ? channelId.value : undefined;
            await e2ee.decryptMessages(pinnedMessages.value, chId, dmId);
        }
    }

    async function togglePinnedPanel(): Promise<void> {
        showPinnedMessages.value = !showPinnedMessages.value;
        if (showPinnedMessages.value) {
            await fetchAndDecryptPinned();
        }
    }

    async function togglePin(message: MessageData): Promise<void> {
        if (!channelId.value) return;
        const endpoint = isDm.value
            ? `/direct-messages/${channelId.value}/messages/${message.id}/pin`
            : `/channels/${channelId.value}/messages/${message.id}/pin`;

        try {
            if (message.is_pinned) {
                await api.delete(endpoint);
                message.is_pinned = false;
                message.pinned_at = null;
                const idx = pinnedMessages.value.findIndex((m) => m.id === message.id);
                if (idx !== -1) pinnedMessages.value.splice(idx, 1);
            } else {
                await api.post(endpoint);
                message.is_pinned = true;
                message.pinned_at = new Date().toISOString();
                if (showPinnedMessages.value) {
                    await fetchAndDecryptPinned();
                }
            }
        } catch (error) {
            console.error('Failed to toggle pin:', error);
        }
    }

    async function unpinFromPanel(messageId: number): Promise<void> {
        if (!channelId.value) return;
        const endpoint = isDm.value
            ? `/direct-messages/${channelId.value}/messages/${messageId}/pin`
            : `/channels/${channelId.value}/messages/${messageId}/pin`;

        try {
            await api.delete(endpoint);
            const idx = pinnedMessages.value.findIndex((m) => m.id === messageId);
            if (idx !== -1) pinnedMessages.value.splice(idx, 1);
            const msg = activeMessages.value.find((m) => m.id === messageId);
            if (msg) {
                msg.is_pinned = false;
                msg.pinned_at = null;
            }
        } catch (error) {
            console.error('Failed to unpin message:', error);
        }
    }

    return {
        pinnedMessages,
        showPinnedMessages,
        isLoadingPinned,
        fetchPinnedMessages,
        fetchAndDecryptPinned,
        togglePinnedPanel,
        togglePin,
        unpinFromPanel,
    };
}
