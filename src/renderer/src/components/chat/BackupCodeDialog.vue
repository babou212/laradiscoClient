<script setup lang="ts">
import { useClipboard } from '@vueuse/core';
import { Check, Copy } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/auth';
import { useE2eeStore } from '@/stores/e2ee';
import { useServerStore } from '@/stores/server';

const e2eeStore = useE2eeStore();
const authStore = useAuthStore();
const serverStore = useServerStore();

const code = ref<string | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);

const { copy, copied } = useClipboard();

// Blocking: no setter path — the dialog only closes via confirm().
const open = computed(() => e2eeStore.backupNeeded && !e2eeStore.linkRequired);

async function prepare(): Promise<void> {
    const host = serverStore.activeHost;
    const token = authStore.token;
    if (!host || !token || busy.value) return;
    busy.value = true;
    error.value = null;
    try {
        code.value = await window.api.mls.backupPrompt(host, token);
    } catch {
        error.value = 'Could not create your encrypted backup. Check your connection and try again.';
    } finally {
        busy.value = false;
    }
}

watch(open, (v) => v && void prepare(), { immediate: true });

async function confirm(): Promise<void> {
    if (busy.value || !code.value) return;
    busy.value = true;
    try {
        await window.api.mls.backupConfirmed();
        e2eeStore.setBackupNeeded(false);
        code.value = null;
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <Dialog :open="open">
        <DialogContent
            class="sm:max-w-md"
            :show-close-button="false"
            @escape-key-down.prevent
            @interact-outside.prevent
            @pointer-down-outside.prevent
        >
            <DialogHeader>
                <DialogTitle>Save your recovery code</DialogTitle>
                <DialogDescription>
                    Your messages are end-to-end encrypted. Save this recovery code somewhere safe — you'll need it to
                    restore your encrypted message history when you switch or add devices. You won't be able to see it
                    again later.
                </DialogDescription>
            </DialogHeader>

            <div class="space-y-3">
                <div
                    v-if="error"
                    class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
                >
                    {{ error }}
                </div>
                <template v-if="code">
                    <code
                        class="bg-muted block rounded-md px-4 py-3 text-center font-mono text-sm break-all select-all"
                    >
                        {{ code }}
                    </code>
                    <Button variant="outline" class="w-full" @click="copy(code)">
                        <Check v-if="copied" class="size-4 text-green-500" />
                        <Copy v-else class="size-4" />
                        {{ copied ? 'Copied' : 'Copy recovery code' }}
                    </Button>
                </template>
            </div>

            <DialogFooter>
                <Button v-if="error" variant="outline" :disabled="busy" @click="prepare">Try again</Button>
                <Button :disabled="busy || !code" @click="confirm">I've saved my recovery code</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
