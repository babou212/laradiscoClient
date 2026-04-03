import { onUnmounted, reactive } from 'vue';
import type { Ref } from 'vue';
import { sendChannelTyping, sendDmTyping } from '@/api/typing';

export function useTypingIndicator(
    channelId: Ref<string | number | undefined>,
    isDm: Ref<boolean>,
    currentUserId: Ref<string | number | undefined>,
) {
    const typingUsers = reactive(new Map<number, { username: string; timeout: ReturnType<typeof setTimeout> }>());
    let typingDebounceTimer: ReturnType<typeof setTimeout> | null = null;

    function clearTypingUser(userId: number) {
        const existing = typingUsers.get(userId);
        if (existing) {
            clearTimeout(existing.timeout);
            typingUsers.delete(userId);
        }
    }

    function clearAll() {
        for (const [, entry] of typingUsers) {
            clearTimeout(entry.timeout);
        }
        typingUsers.clear();
    }

    function handleTypingEvent(data: { user_id: number; username: string; is_typing: boolean }) {
        if (data.user_id === currentUserId.value) return;

        if (data.is_typing) {
            const existing = typingUsers.get(data.user_id);
            if (existing) clearTimeout(existing.timeout);

            const timeout = setTimeout(() => {
                typingUsers.delete(data.user_id);
            }, 3000);

            typingUsers.set(data.user_id, { username: data.username, timeout });
        } else {
            clearTypingUser(data.user_id);
        }
    }

    function emitTyping() {
        if (!channelId.value) return;
        if (typingDebounceTimer) return;

        const typingFn = isDm.value
            ? () => sendDmTyping(channelId.value!)
            : () => sendChannelTyping(channelId.value!);

        typingFn().catch(() => {});

        typingDebounceTimer = setTimeout(() => {
            typingDebounceTimer = null;
        }, 2000);
    }

    onUnmounted(() => {
        clearAll();
        if (typingDebounceTimer) clearTimeout(typingDebounceTimer);
    });

    return { typingUsers, handleTypingEvent, clearTypingUser, clearAll, emitTyping };
}
