import { computed, onUnmounted, shallowRef } from 'vue';

export function useRateLimit() {
    const rateLimitedUntil = shallowRef<number | null>(null);
    const rateLimitCountdown = shallowRef(0);
    const sendError = shallowRef<string | null>(null);
    let rateLimitTimer: ReturnType<typeof setInterval> | null = null;

    const isRateLimited = computed(() => rateLimitedUntil.value !== null && Date.now() < rateLimitedUntil.value);

    function startRateLimitCooldown(retryAfterSeconds: number): void {
        rateLimitedUntil.value = Date.now() + retryAfterSeconds * 1000;
        rateLimitCountdown.value = retryAfterSeconds;
        sendError.value = `You're sending too many messages. Please wait ${retryAfterSeconds} seconds.`;

        if (rateLimitTimer) clearInterval(rateLimitTimer);
        rateLimitTimer = setInterval(() => {
            if (!rateLimitedUntil.value || Date.now() >= rateLimitedUntil.value) {
                rateLimitedUntil.value = null;
                rateLimitCountdown.value = 0;
                sendError.value = null;
                if (rateLimitTimer) {
                    clearInterval(rateLimitTimer);
                    rateLimitTimer = null;
                }
            } else {
                rateLimitCountdown.value = Math.ceil((rateLimitedUntil.value - Date.now()) / 1000);
                sendError.value = `You're sending too many messages. Please wait ${rateLimitCountdown.value}s.`;
            }
        }, 1000);
    }

    onUnmounted(() => {
        if (rateLimitTimer) clearInterval(rateLimitTimer);
    });

    return { isRateLimited, rateLimitCountdown, sendError, startRateLimitCooldown };
}
