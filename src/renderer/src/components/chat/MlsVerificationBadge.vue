<script setup lang="ts">
import { ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-vue-next';
import { onMounted, ref, watch } from 'vue';
import { Button } from '@/components/ui/button';
import { SimpleTooltip } from '@/components/ui/tooltip';
import { useAuthStore } from '@/stores/auth';
import { useServerStore } from '@/stores/server';

const props = defineProps<{ peerUserId: number }>();

const authStore = useAuthStore();
const serverStore = useServerStore();

const status = ref<{ pinned: boolean; verified: boolean; changed: boolean; safetyNumber: string | null } | null>(null);
const open = ref(false);

async function load(): Promise<void> {
    const host = serverStore.activeHost;
    const token = authStore.token;
    if (!host || !token) return;
    try {
        status.value = await window.api.mls.verificationStatus(host, token, props.peerUserId);
    } catch {
        status.value = null;
    }
}

async function markVerified(): Promise<void> {
    await window.api.mls.markVerified(props.peerUserId);
    await load();
}

onMounted(load);
watch(() => props.peerUserId, load);
</script>

<template>
    <div v-if="status" class="relative">
        <SimpleTooltip
            :content="
                status.changed
                    ? 'Security code changed — verify this contact'
                    : status.verified
                      ? 'Contact verified'
                      : 'Encrypted — not yet verified'
            "
        >
            <button
                class="rounded p-1 transition-colors"
                :class="{
                    'text-red-500 hover:bg-red-500/10': status.changed,
                    'text-green-600 hover:bg-green-600/10': status.verified && !status.changed,
                    'text-muted-foreground hover:bg-muted': !status.verified && !status.changed,
                }"
                @click="open = !open"
            >
                <ShieldAlert v-if="status.changed" :size="18" />
                <ShieldCheck v-else-if="status.verified" :size="18" />
                <ShieldQuestion v-else :size="18" />
            </button>
        </SimpleTooltip>

        <div
            v-if="open"
            class="bg-popover absolute right-0 z-50 mt-2 w-72 rounded-md border p-4 shadow-lg"
            @keydown.esc="open = false"
        >
            <h4 class="text-sm font-semibold">End-to-end encrypted</h4>
            <p v-if="status.changed" class="mt-1 text-xs text-red-500">
                This contact's security code changed. If unexpected, their account may be compromised — re-verify before
                trusting.
            </p>
            <p v-if="status.safetyNumber" class="text-muted-foreground mt-2 text-xs">
                Compare this safety number with your contact in person or over another trusted channel. If they match,
                your conversation is secure.
            </p>
            <p v-else class="text-muted-foreground mt-2 text-xs">
                This contact hasn't set up encryption yet, so there's no safety number to compare.
            </p>
            <code
                v-if="status.safetyNumber"
                class="bg-muted mt-2 block rounded p-2 font-mono text-xs break-all select-all"
            >
                {{ status.safetyNumber }}
            </code>
            <div class="mt-3 flex justify-end gap-2">
                <Button variant="ghost" size="sm" @click="open = false">Close</Button>
                <Button
                    v-if="status.safetyNumber && (!status.verified || status.changed)"
                    size="sm"
                    @click="markVerified"
                >
                    Mark as verified
                </Button>
            </div>
        </div>
    </div>
</template>
