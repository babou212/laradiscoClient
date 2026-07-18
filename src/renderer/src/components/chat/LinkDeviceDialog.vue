<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/auth';
import { useE2eeStore } from '@/stores/e2ee';
import { useServerStore } from '@/stores/server';

const e2eeStore = useE2eeStore();
const authStore = useAuthStore();
const serverStore = useServerStore();

const code = ref('');
const busy = ref(false);
const error = ref<string | null>(null);

const open = computed({
    get: () => e2eeStore.linkRequired,
    set: (v: boolean) => e2eeStore.setLinkRequired(v),
});

async function link(): Promise<void> {
    const host = serverStore.activeHost;
    const token = authStore.token;
    const recovery = code.value.trim();
    if (!host || !token || !recovery || busy.value) return;
    busy.value = true;
    error.value = null;
    try {
        await window.api.mls.restore(host, token, recovery);
        code.value = '';
        e2eeStore.setLinkRequired(false);
    } catch {
        error.value = 'Could not link this device. Check your recovery code and try again.';
    } finally {
        busy.value = false;
    }
}
</script>

<template>
    <Dialog v-model:open="open">
        <DialogContent class="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Link this device</DialogTitle>
                <DialogDescription>
                    Your messages are end-to-end encrypted and this account is already set up on another device. Enter
                    your recovery code to securely link this device and restore your message history.
                </DialogDescription>
            </DialogHeader>

            <div class="space-y-3">
                <div
                    v-if="error"
                    class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
                >
                    {{ error }}
                </div>
                <div class="grid gap-2">
                    <Label for="link-recovery-code">Recovery code</Label>
                    <Input
                        id="link-recovery-code"
                        v-model="code"
                        autocomplete="off"
                        spellcheck="false"
                        placeholder="Enter your recovery code"
                        class="font-mono"
                        @keydown.enter.prevent="link"
                    />
                </div>
                <p class="text-muted-foreground text-xs">
                    Don't have it? You can set up a fresh identity from Settings → Security, but you won't be able to
                    read past messages on this device.
                </p>
            </div>

            <DialogFooter>
                <Button variant="ghost" :disabled="busy" @click="open = false">Not now</Button>
                <Button :disabled="busy || !code.trim()" @click="link">Link device</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>
