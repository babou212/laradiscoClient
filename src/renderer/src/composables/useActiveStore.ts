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

    function updateMessage(id: number, partial: Partial<MessageData>): void {
        if (isDm.value) {
            dmStore.updateMessage(id, partial);
        } else {
            chatStore.updateMessage(id, partial);
        }
    }

    function removeMessage(id: number): void {
        if (isDm.value) {
            dmStore.removeMessage(id);
        } else {
            chatStore.removeMessage(id);
        }
    }

    async function loadOlderMessages(): Promise<void> {
        return isDm.value ? dmStore.loadOlderMessages() : chatStore.loadOlderMessages();
    }

    return { messages, isLoadingMessages, addMessage, updateMessage, removeMessage, loadOlderMessages };
}
