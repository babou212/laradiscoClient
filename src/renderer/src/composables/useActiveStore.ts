import { computed } from 'vue';
import type { Ref } from 'vue';
import { useChatStore } from '@/stores/chat';
import { useDirectMessagesStore } from '@/stores/directMessages';
import type { MessageData } from '@/types/chat';

export function useActiveStore(isDm: Ref<boolean>) {
    const chatStore = useChatStore();
    const dmStore = useDirectMessagesStore();

    const messages = computed<MessageData[]>(() => (isDm.value ? dmStore.messages : chatStore.messages));

    const isLoadingMessages = computed<boolean>(() =>
        isDm.value ? dmStore.isLoadingMessages : chatStore.isLoadingMessages,
    );

    function addMessage(msg: MessageData): void {
        if (isDm.value) {
            dmStore.addMessage(msg);
        } else {
            chatStore.addMessage(msg);
        }
    }

    function updateMessage(id: string, partial: Partial<MessageData>): void {
        if (isDm.value) {
            dmStore.updateMessage(id, partial);
        } else {
            chatStore.updateMessage(id, partial);
        }
    }

    function removeMessage(id: string): void {
        if (isDm.value) {
            dmStore.removeMessage(id);
        } else {
            chatStore.removeMessage(id);
        }
    }

    const canLoadMore = computed<boolean>(() =>
        isDm.value ? dmStore.prevCursor != null : chatStore.prevCursor != null,
    );

    async function loadOlderMessages(): Promise<void> {
        return isDm.value ? dmStore.loadOlderMessages() : chatStore.loadOlderMessages();
    }

    return { messages, isLoadingMessages, canLoadMore, addMessage, updateMessage, removeMessage, loadOlderMessages };
}
