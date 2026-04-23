<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useVoiceStore } from '@/stores/voice';

const { t } = useI18n();
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
        recordError.value = t('settings.voice.pushToTalk.errors.unsupportedGlobal', { key: e.code });
        return;
    }

    const displayName = keyEventToDisplayName(e);
    if (!displayName) {
        recordError.value = t('settings.voice.pushToTalk.errors.keyNotSupported');
        return;
    }

    if (!capturedKeyPromise) {
        recordError.value = t('settings.voice.pushToTalk.errors.captureNotReady');
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
        recordError.value = t('settings.voice.pushToTalk.errors.captureFailed');
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
                <h2 class="text-lg font-semibold">{{ t('settings.voice.microphone.title') }}</h2>
                <p class="text-muted-foreground mt-1 text-sm">{{ t('settings.voice.microphone.description') }}</p>
            </div>
            <div class="p-6">
                <label class="mb-2 block text-sm font-medium">{{ t('settings.voice.microphone.input') }}</label>
                <Select
                    :model-value="voiceStore.selectedMicDeviceId"
                    @update:model-value="(val) => typeof val === 'string' && voiceStore.setMicDevice(val)"
                >
                    <SelectTrigger>
                        <SelectValue :placeholder="t('settings.voice.microphone.systemDefault')" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="default">{{ t('settings.voice.microphone.systemDefault') }}</SelectItem>
                        <SelectItem v-for="mic in voiceStore.availableMics" :key="mic.deviceId" :value="mic.deviceId">
                            {{
                                mic.label ||
                                t('settings.voice.microphone.micFallback', { id: mic.deviceId.slice(0, 8) })
                            }}
                        </SelectItem>
                    </SelectContent>
                </Select>

                <Button variant="outline" size="sm" class="mt-3" @click="voiceStore.refreshAvailableMics()">
                    {{ t('settings.voice.microphone.refresh') }}
                </Button>
            </div>
        </div>

        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">{{ t('settings.voice.pushToTalk.title') }}</h2>
                <p class="text-muted-foreground mt-1 text-sm">
                    {{ t('settings.voice.pushToTalk.description') }}
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
                    <span class="text-sm font-medium">{{ t('settings.voice.pushToTalk.enable') }}</span>
                </label>

                <div v-if="voiceStore.pttEnabled">
                    <label class="mb-2 block text-sm font-medium">{{ t('settings.voice.pushToTalk.keybind') }}</label>

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
                                <span class="animate-pulse text-yellow-500">
                                    {{ t('settings.voice.pushToTalk.pressAnyKey') }}
                                </span>
                            </template>
                            <template v-else-if="voiceStore.pttKey">
                                <kbd class="bg-muted rounded px-2 py-0.5 font-mono text-xs">{{
                                    formatAccelerator(voiceStore.pttKey)
                                }}</kbd>
                            </template>
                            <template v-else>
                                <span class="text-muted-foreground">{{ t('settings.voice.pushToTalk.notSet') }}</span>
                            </template>
                        </div>

                        <Button v-if="!isRecordingKey" variant="outline" size="sm" @click="startRecordingKey">
                            {{
                                voiceStore.pttKey
                                    ? t('settings.voice.pushToTalk.changeKey')
                                    : t('settings.voice.pushToTalk.setKey')
                            }}
                        </Button>
                        <Button v-if="isRecordingKey" variant="outline" size="sm" @click="cancelRecordingKey">
                            {{ t('settings.voice.pushToTalk.cancel') }}
                        </Button>
                        <Button
                            v-if="voiceStore.pttKey && !isRecordingKey"
                            variant="ghost"
                            size="sm"
                            class="text-destructive"
                            @click="clearPttKey"
                        >
                            {{ t('settings.voice.pushToTalk.clear') }}
                        </Button>
                    </div>

                    <p v-if="recordError" class="text-destructive mt-2 text-xs">
                        {{ recordError }}
                    </p>

                    <p class="text-muted-foreground mt-2 text-xs">
                        {{ t('settings.voice.pushToTalk.hint') }}
                    </p>

                    <label class="mt-4 flex items-center gap-3">
                        <input
                            type="checkbox"
                            class="border-input accent-primary h-4 w-4 rounded"
                            :checked="voiceStore.pttSoundEnabled"
                            @change="onPttSoundToggle"
                        />
                        <span class="text-sm font-medium">{{ t('settings.voice.pushToTalk.playSound') }}</span>
                    </label>
                </div>
            </div>
        </div>
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">{{ t('settings.voice.audio.title') }}</h2>
                <p class="text-muted-foreground mt-1 text-sm">{{ t('settings.voice.audio.description') }}</p>
            </div>
            <div class="space-y-4 p-6">
                <label class="flex items-center justify-between gap-3">
                    <div>
                        <span class="text-sm font-medium">{{ t('settings.voice.audio.noiseSuppression') }}</span>
                        <p class="text-muted-foreground text-xs">
                            {{ t('settings.voice.audio.noiseSuppressionHint') }}
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
                        <span class="text-sm font-medium">{{ t('settings.voice.audio.echoCancellation') }}</span>
                        <p class="text-muted-foreground text-xs">
                            {{ t('settings.voice.audio.echoCancellationHint') }}
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
                        <span class="text-sm font-medium">{{ t('settings.voice.audio.autoGain') }}</span>
                        <p class="text-muted-foreground text-xs">
                            {{ t('settings.voice.audio.autoGainHint') }}
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
                <h2 class="text-lg font-semibold">{{ t('settings.voice.test.title') }}</h2>
                <p class="text-muted-foreground mt-1 text-sm">
                    {{ t('settings.voice.test.description') }}
                </p>
            </div>
            <div class="space-y-4 p-6">
                <div class="flex items-center gap-3">
                    <Button variant="outline" size="sm" @click="startMicTest">
                        {{ isMicTesting ? t('settings.voice.test.stop') : t('settings.voice.test.start') }}
                    </Button>
                    <span v-if="isMicTesting" class="text-muted-foreground animate-pulse text-xs">
                        {{ t('settings.voice.test.listening') }}
                    </span>
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
                        {{ t('settings.voice.test.hint') }}
                    </p>
                </div>
            </div>
        </div>
    </div>
</template>
