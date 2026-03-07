<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useServerStore } from '@/stores/server';
import { Loader2Icon, CheckCircle2Icon } from 'lucide-vue-next';
import AuthLayout from '@/layouts/AuthLayout.vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const router = useRouter();
const serverStore = useServerStore();

const host = ref('');
const isTestingConnection = ref(false);
const serverInfo = ref<Record<string, unknown> | null>(null);

async function testConnection(): Promise<void> {
    if (!host.value.trim()) return;

    serverInfo.value = null;
    serverStore.clearError();
    isTestingConnection.value = true;

    const result = await serverStore.pingServer(host.value.trim());

    if (result.success && result.data) {
        serverInfo.value = result.data;
    }

    isTestingConnection.value = false;
}

async function connectAndSave(): Promise<void> {
    if (!serverInfo.value) return;

    const name = (serverInfo.value.app as string) || host.value.trim();
    const connection = await serverStore.saveConnection(name, host.value.trim());

    if (connection) {
        router.push({ name: 'login' });
    }
}
</script>

<template>
    <AuthLayout title="LaraDisco" description="Connect to your server to get started">
        <form @submit.prevent="testConnection" class="space-y-5">
            <div class="grid gap-2">
                <Label for="host">Server Address</Label>
                <Input
                    id="host"
                    v-model="host"
                    type="text"
                    placeholder="chat.example.com"
                    :disabled="isTestingConnection"
                />
            </div>

            <div
                v-if="serverStore.connectionError"
                class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
                {{ serverStore.connectionError }}
            </div>

            <div
                v-if="serverInfo"
                class="flex items-start gap-3 rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-500 dark:text-green-400"
            >
                <CheckCircle2Icon class="mt-0.5 size-4 shrink-0" />
                <div>
                    <p class="font-medium">Connected to {{ serverInfo.app }}</p>
                    <p class="mt-0.5 text-xs opacity-70">
                        Laravel {{ serverInfo.version }}
                    </p>
                </div>
            </div>

            <div class="flex flex-col gap-3 pt-1">
                <Button
                    v-if="!serverInfo"
                    type="submit"
                    :disabled="isTestingConnection || !host.trim()"
                    class="w-full"
                >
                    <Loader2Icon v-if="isTestingConnection" class="animate-spin" />
                    <span v-if="isTestingConnection">Connecting...</span>
                    <span v-else>Test Connection</span>
                </Button>
                <Button
                    v-else
                    type="button"
                    @click="connectAndSave"
                    class="w-full"
                >
                    Continue
                </Button>
            </div>
        </form>

        <div v-if="serverStore.servers.length > 0" class="border-t border-border pt-6">
            <p class="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Saved Servers
            </p>
            <div class="space-y-2">
                <button
                    v-for="server in serverStore.servers"
                    :key="server.id"
                    @click="host = server.host; serverInfo = null; serverStore.clearError();"
                    class="flex w-full items-center justify-between rounded-md border border-border bg-card px-4 py-3 text-left text-sm transition hover:border-ring hover:bg-accent"
                >
                    <div>
                        <p class="font-medium text-foreground">{{ server.name }}</p>
                        <p class="text-xs text-muted-foreground">{{ server.host }}</p>
                    </div>
                    <span
                        v-if="server.is_active"
                        class="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-500 dark:text-green-400"
                    >
                        Active
                    </span>
                </button>
            </div>
        </div>
    </AuthLayout>
</template>
