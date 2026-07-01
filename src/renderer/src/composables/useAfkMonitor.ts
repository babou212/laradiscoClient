import { computed, onUnmounted, watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useChatStore } from '@/stores/chat';
import { useServerStore } from '@/stores/server';
import { useVoiceStore } from '@/stores/voice';

export function useAfkMonitor() {
    const voiceStore = useVoiceStore();
    const serverStore = useServerStore();
    const chatStore = useChatStore();
    const authStore = useAuthStore();

    let afkTimer: ReturnType<typeof setTimeout> | null = null;

    function clearAfkTimer() {
        if (afkTimer !== null) {
            clearTimeout(afkTimer);
            afkTimer = null;
        }
    }

    function scheduleAfkMove() {
        clearAfkTimer();
        const afkChannelId = serverStore.afkChannelId;
        if (!afkChannelId) return;
        if (!voiceStore.currentChannel) return;
        if (voiceStore.currentChannel.id === afkChannelId) return;

        const timeoutMs = (serverStore.afkTimeout ?? 5) * 60 * 1000;
        afkTimer = setTimeout(() => {
            afkTimer = null;
            const targetId = serverStore.afkChannelId;
            if (!targetId || !voiceStore.currentChannel) return;
            if (voiceStore.currentChannel.id === targetId) return;

            const afkChannel = chatStore.categories
                .flatMap((c) => c.channels)
                .find((ch) => Number(ch.id) === targetId);

            voiceStore.joinChannel(targetId, afkChannel?.name ?? 'AFK');
        }, timeoutMs);
    }

    const localIsSpeaking = computed(() => {
        const userId = authStore.user?.id;
        if (!userId || !voiceStore.currentChannel) return false;
        const local = voiceStore.currentParticipants.find((p) => String(p.id) === String(userId));
        return local?.isSpeaking ?? false;
    });

    // Any speaking activity resets the inactivity countdown
    watch(localIsSpeaking, (speaking) => {
        if (speaking) scheduleAfkMove();
    });

    // Start (or cancel) the timer whenever the current voice channel changes
    watch(
        () => voiceStore.currentChannel,
        (channel) => {
            if (!channel) {
                clearAfkTimer();
                return;
            }
            if (serverStore.afkChannelId && channel.id === serverStore.afkChannelId) {
                clearAfkTimer();
                return;
            }
            scheduleAfkMove();
        },
    );

    onUnmounted(clearAfkTimer);
}
