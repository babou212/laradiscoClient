<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { Button } from '@/components/ui/button';
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
});

function onMicChange(event: Event) {
    const target = event.target as HTMLSelectElement;
    voiceStore.setMicDevice(target.value);
}

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
                <label for="mic-select" class="mb-2 block text-sm font-medium"> Input Device </label>
                <select
                    id="mic-select"
                    class="border-input bg-background focus:border-ring focus:ring-ring w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:ring-1 focus:outline-none"
                    :value="voiceStore.selectedMicDeviceId"
                    @change="onMicChange"
                >
                    <option value="default">System Default</option>
                    <option v-for="mic in voiceStore.availableMics" :key="mic.deviceId" :value="mic.deviceId">
                        {{ mic.label || `Microphone (${mic.deviceId.slice(0, 8)})` }}
                    </option>
                </select>

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
    </div>
</template>
