<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVoiceStore } from '@/stores/voice';

const voiceStore = useVoiceStore();

const isRecordingKey = ref(false);
const recordError = ref<string | null>(null);

let capturedKeyPromise: Promise<{
    keycode: number;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
}> | null = null;

onMounted(async () => {
    await voiceStore.loadSettings();
    await voiceStore.refreshAvailableMics();
});

onBeforeUnmount(() => {
    if (isRecordingKey.value) {
        cancelRecordingKey();
    }
    stopMicTest();
});

function onPttToggle(event: Event) {
    const target = event.target as HTMLInputElement;
    voiceStore.setPttEnabled(target.checked);
}

function onPttSoundToggle(event: Event) {
    const target = event.target as HTMLInputElement;
    voiceStore.setPttSoundEnabled(target.checked);
}

const CODE_MAP: Record<string, string> = {
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Space: 'Space',
    Tab: 'Tab',
    Enter: 'Return',
    Escape: 'Escape',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    NumpadAdd: 'numadd',
    NumpadSubtract: 'numsub',
    NumpadMultiply: 'nummult',
    NumpadDivide: 'numdiv',
    NumpadDecimal: 'numdec',
    NumpadEnter: 'Return',
    CapsLock: 'Capslock',
    NumLock: 'Numlock',
    ScrollLock: 'Scrolllock',
    PrintScreen: 'PrintScreen',
};

const PURE_MODIFIER_CODES = new Set([
    'ShiftLeft',
    'ShiftRight',
    'ControlLeft',
    'ControlRight',
    'AltLeft',
    'AltRight',
    'MetaLeft',
    'MetaRight',
]);

const UNSUPPORTED_CODES = new Set(['Pause', 'ContextMenu']);

function keyEventToDisplayName(e: KeyboardEvent): string | null {
    if (PURE_MODIFIER_CODES.has(e.code)) return null;

    const parts: string[] = [];

    if (e.ctrlKey || e.metaKey) parts.push('CmdOrCtrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');

    let key: string | null = null;

    const fMatch = e.code.match(/^F(\d+)$/);
    if (fMatch) {
        key = `F${fMatch[1]}`;
    } else if (/^Key[A-Z]$/.test(e.code)) {
        key = e.code.slice(3);
    } else if (/^Digit[0-9]$/.test(e.code)) {
        key = e.code.slice(5);
    } else if (/^Numpad\d$/.test(e.code)) {
        key = `num${e.code.slice(6)}`;
    } else if (CODE_MAP[e.code]) {
        key = CODE_MAP[e.code];
    }

    if (!key) return null;

    parts.push(key);
    return parts.join('+');
}

async function onKeyDown(e: KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (PURE_MODIFIER_CODES.has(e.code)) return;
    if (UNSUPPORTED_CODES.has(e.code)) {
        recordError.value = `"${e.code}" cannot be used as a global shortcut.`;
        return;
    }

    const displayName = keyEventToDisplayName(e);
    if (!displayName) {
        recordError.value = 'That key is not supported.';
        return;
    }

    if (!capturedKeyPromise) {
        recordError.value = 'Key capture not ready. Please try again.';
        return;
    }

    try {
        const captured = await capturedKeyPromise;
        recordError.value = null;
        voiceStore.setPttKey(displayName, captured.keycode, {
            ctrl: captured.ctrlKey,
            shift: captured.shiftKey,
            alt: captured.altKey,
            meta: captured.metaKey,
        });
        stopRecording();
    } catch {
        recordError.value = 'Failed to capture key. Please try again.';
    }
}

function startRecordingKey() {
    recordError.value = null;
    isRecordingKey.value = true;

    capturedKeyPromise = window.api.ptt.captureNextKey();
    window.addEventListener('keydown', onKeyDown, true);
}

function stopRecording() {
    isRecordingKey.value = false;
    capturedKeyPromise = null;
    window.removeEventListener('keydown', onKeyDown, true);
}

function cancelRecordingKey() {
    window.api.ptt.cancelCapture();
    stopRecording();
}

function clearPttKey() {
    voiceStore.setPttKey(null, null);
}

function onNoiseSuppressionToggle(event: Event) {
    const target = event.target as HTMLInputElement;
    voiceStore.setNoiseSuppression(target.checked);
}

function onEchoCancellationToggle(event: Event) {
    const target = event.target as HTMLInputElement;
    voiceStore.setEchoCancellation(target.checked);
}

function onAutoGainControlToggle(event: Event) {
    const target = event.target as HTMLInputElement;
    voiceStore.setAutoGainControl(target.checked);
}

const micLevel = ref(0);
const isMicTesting = ref(false);
let micTestStream: MediaStream | null = null;
let micTestAudioCtx: AudioContext | null = null;
let micTestAnimFrame: number | null = null;
let micTestSource: MediaStreamAudioSourceNode | null = null;
let micTestGain: GainNode | null = null;

function startMicTest() {
    if (isMicTesting.value) {
        stopMicTest();
        return;
    }

    const deviceId =
        voiceStore.selectedMicDeviceId && voiceStore.selectedMicDeviceId !== 'default'
            ? voiceStore.selectedMicDeviceId
            : undefined;

    navigator.mediaDevices
        .getUserMedia({
            audio: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                noiseSuppression: voiceStore.noiseSuppression,
                echoCancellation: voiceStore.echoCancellation,
                autoGainControl: voiceStore.autoGainControl,
            },
        })
        .then((stream) => {
            micTestStream = stream;
            micTestAudioCtx = new AudioContext();
            micTestSource = micTestAudioCtx.createMediaStreamSource(stream);
            const analyser = micTestAudioCtx.createAnalyser();
            analyser.fftSize = 1024;
            analyser.smoothingTimeConstant = 0.4;
            micTestSource.connect(analyser);

            // Loopback: let the user hear themselves
            micTestGain = micTestAudioCtx.createGain();
            micTestGain.gain.value = 1;
            analyser.connect(micTestGain);
            micTestGain.connect(micTestAudioCtx.destination);

            const dataArray = new Float32Array(analyser.fftSize);
            isMicTesting.value = true;

            function updateLevel() {
                analyser.getByteTimeDomainData(new Uint8Array(analyser.fftSize));
                analyser.getFloatTimeDomainData(dataArray);

                // RMS level calculation
                let sumSquares = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sumSquares += dataArray[i] * dataArray[i];
                }
                const rms = Math.sqrt(sumSquares / dataArray.length);
                // Map RMS to 0-100 (typical speech RMS is ~0.05-0.2)
                micLevel.value = Math.min(100, Math.round(rms * 350));
                micTestAnimFrame = requestAnimationFrame(updateLevel);
            }
            updateLevel();
        })
        .catch((err) => {
            console.warn('[Voice] Mic test failed:', err);
        });
}

function stopMicTest() {
    isMicTesting.value = false;
    micLevel.value = 0;
    if (micTestAnimFrame !== null) {
        cancelAnimationFrame(micTestAnimFrame);
        micTestAnimFrame = null;
    }
    micTestSource = null;
    micTestGain = null;
    if (micTestStream) {
        micTestStream.getTracks().forEach((t) => t.stop());
        micTestStream = null;
    }
    if (micTestAudioCtx) {
        micTestAudioCtx.close();
        micTestAudioCtx = null;
    }
}

function formatAccelerator(accel: string): string {
    const isMac = navigator.platform.includes('Mac');
    return accel
        .replace(/CmdOrCtrl/g, isMac ? '⌘' : 'Ctrl')
        .replace(/Shift/g, isMac ? '⇧' : 'Shift')
        .replace(/Alt/g, isMac ? '⌥' : 'Alt')
        .replace(/\+/g, ' + ');
}
</script>

<template>
    <div class="space-y-6">
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">Microphone</h2>
                <p class="text-muted-foreground mt-1 text-sm">Select which microphone to use for voice channels</p>
            </div>
            <div class="p-6">
                <label class="mb-2 block text-sm font-medium"> Input Device </label>
                <Select
                    :model-value="voiceStore.selectedMicDeviceId"
                    @update:model-value="(val) => typeof val === 'string' && voiceStore.setMicDevice(val)"
                >
                    <SelectTrigger>
                        <SelectValue placeholder="System Default" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="default">System Default</SelectItem>
                        <SelectItem v-for="mic in voiceStore.availableMics" :key="mic.deviceId" :value="mic.deviceId">
                            {{ mic.label || `Microphone (${mic.deviceId.slice(0, 8)})` }}
                        </SelectItem>
                    </SelectContent>
                </Select>

                <Button variant="outline" size="sm" class="mt-3" @click="voiceStore.refreshAvailableMics()">
                    Refresh Devices
                </Button>
            </div>
        </div>

        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">Push to Talk</h2>
                <p class="text-muted-foreground mt-1 text-sm">
                    Hold a key to unmute your microphone. Works across all windows and apps.
                </p>
            </div>
            <div class="space-y-4 p-6">
                <label class="flex items-center gap-3">
                    <input
                        type="checkbox"
                        class="border-input accent-primary h-4 w-4 rounded"
                        :checked="voiceStore.pttEnabled"
                        @change="onPttToggle"
                    />
                    <span class="text-sm font-medium">Enable Push to Talk</span>
                </label>

                <div v-if="voiceStore.pttEnabled">
                    <label class="mb-2 block text-sm font-medium">Keybind</label>

                    <div class="flex items-center gap-3">
                        <div
                            class="flex h-9 min-w-[160px] items-center rounded-md border px-3 text-sm transition-colors"
                            :class="
                                isRecordingKey
                                    ? 'border-yellow-500 bg-yellow-500/5 ring-1 ring-yellow-500'
                                    : 'border-input bg-background'
                            "
                        >
                            <template v-if="isRecordingKey">
                                <span class="animate-pulse text-yellow-500">Press any key or combo…</span>
                            </template>
                            <template v-else-if="voiceStore.pttKey">
                                <kbd class="bg-muted rounded px-2 py-0.5 font-mono text-xs">{{
                                    formatAccelerator(voiceStore.pttKey)
                                }}</kbd>
                            </template>
                            <template v-else>
                                <span class="text-muted-foreground">Not set</span>
                            </template>
                        </div>

                        <Button v-if="!isRecordingKey" variant="outline" size="sm" @click="startRecordingKey">
                            {{ voiceStore.pttKey ? 'Change Key' : 'Set Key' }}
                        </Button>
                        <Button v-if="isRecordingKey" variant="outline" size="sm" @click="cancelRecordingKey">
                            Cancel
                        </Button>
                        <Button
                            v-if="voiceStore.pttKey && !isRecordingKey"
                            variant="ghost"
                            size="sm"
                            class="text-destructive"
                            @click="clearPttKey"
                        >
                            Clear
                        </Button>
                    </div>

                    <p v-if="recordError" class="text-destructive mt-2 text-xs">
                        {{ recordError }}
                    </p>

                    <p class="text-muted-foreground mt-2 text-xs">
                        Press any key or key combination (e.g. F5, Space, Alt + Z, Ctrl + Shift + M). Hold the key to
                        talk — release to mute.
                    </p>

                    <label class="mt-4 flex items-center gap-3">
                        <input
                            type="checkbox"
                            class="border-input accent-primary h-4 w-4 rounded"
                            :checked="voiceStore.pttSoundEnabled"
                            @change="onPttSoundToggle"
                        />
                        <span class="text-sm font-medium">Play sound on push-to-talk</span>
                    </label>
                </div>
            </div>
        </div>
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">Audio Processing</h2>
                <p class="text-muted-foreground mt-1 text-sm">Built-in noise suppression and audio enhancements</p>
            </div>
            <div class="space-y-4 p-6">
                <label class="flex items-center justify-between gap-3">
                    <div>
                        <span class="text-sm font-medium">Noise Suppression</span>
                        <p class="text-muted-foreground text-xs">
                            Filters out background noise like keyboard clicks, fans, and ambient sounds.
                        </p>
                    </div>
                    <input
                        type="checkbox"
                        class="border-input accent-primary h-4 w-4 rounded"
                        :checked="voiceStore.noiseSuppression"
                        @change="onNoiseSuppressionToggle"
                    />
                </label>

                <label class="flex items-center justify-between gap-3">
                    <div>
                        <span class="text-sm font-medium">Echo Cancellation</span>
                        <p class="text-muted-foreground text-xs">
                            Prevents your speakers' audio from being picked up by your microphone.
                        </p>
                    </div>
                    <input
                        type="checkbox"
                        class="border-input accent-primary h-4 w-4 rounded"
                        :checked="voiceStore.echoCancellation"
                        @change="onEchoCancellationToggle"
                    />
                </label>

                <label class="flex items-center justify-between gap-3">
                    <div>
                        <span class="text-sm font-medium">Automatic Gain Control</span>
                        <p class="text-muted-foreground text-xs">
                            Automatically adjusts your microphone volume to maintain a consistent level.
                        </p>
                    </div>
                    <input
                        type="checkbox"
                        class="border-input accent-primary h-4 w-4 rounded"
                        :checked="voiceStore.autoGainControl"
                        @change="onAutoGainControlToggle"
                    />
                </label>
            </div>
        </div>

        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">Mic Test</h2>
                <p class="text-muted-foreground mt-1 text-sm">
                    Test your microphone and see the input level with your current audio processing settings applied.
                </p>
            </div>
            <div class="space-y-4 p-6">
                <div class="flex items-center gap-3">
                    <Button variant="outline" size="sm" @click="startMicTest">
                        {{ isMicTesting ? 'Stop Test' : 'Test Microphone' }}
                    </Button>
                    <span v-if="isMicTesting" class="text-muted-foreground animate-pulse text-xs">Listening...</span>
                </div>

                <div v-if="isMicTesting" class="space-y-2">
                    <div class="bg-muted h-3 w-full overflow-hidden rounded-full">
                        <div
                            class="h-full rounded-full transition-all duration-75"
                            :class="micLevel > 70 ? 'bg-red-500' : micLevel > 40 ? 'bg-yellow-500' : 'bg-green-500'"
                            :style="{ width: micLevel + '%' }"
                        />
                    </div>
                    <p class="text-muted-foreground text-xs">
                        Speak into your microphone — you'll hear yourself and see the input level. Use headphones to
                        avoid feedback.
                    </p>
                </div>
            </div>
        </div>
    </div>
</template>
