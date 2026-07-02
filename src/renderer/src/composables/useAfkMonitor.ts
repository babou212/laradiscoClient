import { onUnmounted, watch } from 'vue';
import { useServerStore } from '@/stores/server';
import { useVoiceStore } from '@/stores/voice';

const CHECK_INTERVAL_MS = 1000;
const MIC_RMS_THRESHOLD = 0.02;
const INPUT_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const;

/**
 * Moves the local user to the AFK channel when EITHER their mic has been silent
 * (little/no sound) for the configured timeout, OR they have been idle (no
 * keyboard/mouse input) for the timeout — either condition alone triggers it.
 *
 * Presence is measured two ways: in-app input events (always reliable) and the
 * OS-wide idle time from powerMonitor (catches activity in other apps, when the
 * platform supports it — e.g. it can be unavailable under Wayland).
 */
export function useAfkMonitor() {
    const voiceStore = useVoiceStore();
    const serverStore = useServerStore();

    let checkTimer: ReturnType<typeof setInterval> | null = null;
    let lastMicActiveAt = 0;
    let lastInAppInputAt = Date.now();
    let osIdleTrusted = false;

    const markInAppInput = () => {
        lastInAppInputAt = Date.now();
    };

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let analysedTrack: MediaStreamTrack | null = null;
    let rmsBuffer: Float32Array<ArrayBuffer> | null = null;

    function teardownAnalyser() {
        try {
            sourceNode?.disconnect();
        } catch {
            // ignore
        }
        sourceNode = null;
        analyser = null;
        analysedTrack = null;
        rmsBuffer = null;
    }

    function ensureAnalyser(): AnalyserNode | null {
        const track = voiceStore.getLocalMicTrack?.() ?? null;
        if (!track) {
            teardownAnalyser();
            return null;
        }
        if (analyser && analysedTrack === track) return analyser;

        teardownAnalyser();
        if (!audioCtx) audioCtx = new AudioContext();
        void audioCtx.resume().catch(() => {});
        sourceNode = audioCtx.createMediaStreamSource(new MediaStream([track]));
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        sourceNode.connect(analyser);
        analysedTrack = track;
        rmsBuffer = new Float32Array(analyser.fftSize);
        return analyser;
    }

    function currentMicRms(): number {
        try {
            const a = ensureAnalyser();
            if (!a || !rmsBuffer) return 0;
            a.getFloatTimeDomainData(rmsBuffer);
            let sumSquares = 0;
            for (let i = 0; i < rmsBuffer.length; i++) sumSquares += rmsBuffer[i] * rmsBuffer[i];
            return Math.sqrt(sumSquares / rmsBuffer.length);
        } catch {
            return 0;
        }
    }

    async function tick() {
        const afkChannelId = serverStore.afkChannelId;
        const channel = voiceStore.currentChannel;
        if (!afkChannelId || !channel || channel.id === afkChannelId) return;

        const now = Date.now();
        const timeoutMs = (serverStore.afkTimeout ?? 5) * 60 * 1000;

        if (currentMicRms() > MIC_RMS_THRESHOLD) lastMicActiveAt = now;

        let osInputAt = -Infinity;
        try {
            const idleSeconds = (await window.api?.idle?.getSystemIdleTime?.()) ?? 0;
            if (idleSeconds > 1) osIdleTrusted = true;
            if (osIdleTrusted) osInputAt = now - idleSeconds * 1000;
        } catch {
            // ignore — fall back to in-app input
        }

        const micIdleFor = now - lastMicActiveAt;
        const inputIdleFor = now - Math.max(lastInAppInputAt, osInputAt);
        if (micIdleFor >= timeoutMs || inputIdleFor >= timeoutMs) {
            stopMonitor();
            void voiceStore.goAfk(afkChannelId);
        }
    }

    function startMonitor() {
        stopMonitor();
        const now = Date.now();
        lastMicActiveAt = now;
        lastInAppInputAt = now;
        checkTimer = setInterval(() => void tick(), CHECK_INTERVAL_MS);
    }

    function stopMonitor() {
        if (checkTimer !== null) {
            clearInterval(checkTimer);
            checkTimer = null;
        }
        teardownAnalyser();
    }

    for (const evt of INPUT_EVENTS) window.addEventListener(evt, markInAppInput, { passive: true });

    watch(
        () => voiceStore.currentChannel,
        (channel) => {
            const afkChannelId = serverStore.afkChannelId;
            if (!channel || (afkChannelId && channel.id === afkChannelId)) {
                stopMonitor();
                return;
            }
            startMonitor();
        },
        { immediate: true },
    );

    onUnmounted(() => {
        stopMonitor();
        for (const evt of INPUT_EVENTS) window.removeEventListener(evt, markInAppInput);
        if (audioCtx) {
            void audioCtx.close().catch(() => {});
            audioCtx = null;
        }
    });
}
