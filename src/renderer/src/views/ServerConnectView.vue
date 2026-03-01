<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useServerStore } from '@/stores/server';

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
    <div class="flex h-screen items-center justify-center bg-gray-950 text-white">
        <div class="w-full max-w-md px-8">
            <!-- Header -->
            <div class="mb-8 text-center">
                <h1 class="text-3xl font-bold">LaraDisco</h1>
                <p class="mt-2 text-sm text-gray-400">Connect to your server to get started</p>
            </div>

            <!-- Server Input -->
            <form @submit.prevent="testConnection" class="space-y-4">
                <div>
                    <label for="host" class="mb-1.5 block text-sm font-medium text-gray-300">
                        Server Address
                    </label>
                    <div class="flex items-center gap-2">
                        <input
                            id="host"
                            v-model="host"
                            type="text"
                            placeholder="chat.example.com"
                            :disabled="isTestingConnection"
                            class="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-white placeholder-gray-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                        />
                    </div>
                </div>

                <!-- Error -->
                <div
                    v-if="serverStore.connectionError"
                    class="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-400"
                >
                    {{ serverStore.connectionError }}
                </div>

                <!-- Success info -->
                <div
                    v-if="serverInfo"
                    class="rounded-lg border border-green-800 bg-green-950/50 px-4 py-3 text-sm text-green-400"
                >
                    <p class="font-medium">Connected to {{ serverInfo.app }}</p>
                    <p class="mt-0.5 text-xs text-green-500">
                        Laravel {{ serverInfo.version }}
                    </p>
                </div>

                <!-- Actions -->
                <div class="flex flex-col gap-3 pt-2">
                    <button
                        v-if="!serverInfo"
                        type="submit"
                        :disabled="isTestingConnection || !host.trim()"
                        class="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <span v-if="isTestingConnection">Connecting...</span>
                        <span v-else>Test Connection</span>
                    </button>
                    <button
                        v-else
                        type="button"
                        @click="connectAndSave"
                        class="w-full rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-green-500"
                    >
                        Continue
                    </button>
                </div>
            </form>

            <!-- Saved Servers -->
            <div v-if="serverStore.servers.length > 0" class="mt-8 border-t border-gray-800 pt-6">
                <p class="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
                    Saved Servers
                </p>
                <div class="space-y-2">
                    <button
                        v-for="server in serverStore.servers"
                        :key="server.id"
                        @click="host = server.host; serverInfo = null; serverStore.clearError();"
                        class="flex w-full items-center justify-between rounded-lg border border-gray-800 bg-gray-900/50 px-4 py-3 text-left text-sm transition hover:border-gray-700 hover:bg-gray-900"
                    >
                        <div>
                            <p class="font-medium text-gray-200">{{ server.name }}</p>
                            <p class="text-xs text-gray-500">{{ server.host }}</p>
                        </div>
                        <span
                            v-if="server.is_active"
                            class="rounded-full bg-green-900/50 px-2 py-0.5 text-xs text-green-400"
                        >
                            Active
                        </span>
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>
