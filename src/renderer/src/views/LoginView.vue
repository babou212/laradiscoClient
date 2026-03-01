<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useServerStore } from '@/stores/server';

const router = useRouter();
const authStore = useAuthStore();
const serverStore = useServerStore();

const email = ref('');
const password = ref('');
const showPassword = ref(false);

const serverName = computed(() => serverStore.activeServer?.name ?? 'Server');
const serverHost = computed(() => serverStore.activeServer?.host ?? '');

const canSubmit = computed(
    () => email.value.trim() !== '' && password.value !== '' && !authStore.isLoggingIn,
);

onMounted(() => {
    // If no server connection, go back to server connect
    if (!serverStore.activeServer) {
        router.replace({ name: 'server-connect' });
    }
});

async function handleLogin(): Promise<void> {
    if (!canSubmit.value) return;

    const success = await authStore.login(email.value.trim(), password.value);

    if (success) {
        router.push({ name: 'home' });
    }
}

function goBack(): void {
    router.push({ name: 'server-connect' });
}
</script>

<template>
    <div class="flex h-screen items-center justify-center bg-gray-950 text-white">
        <div class="w-full max-w-md px-8">
            <!-- Header -->
            <div class="mb-8 text-center">
                <h1 class="text-3xl font-bold">Welcome Back</h1>
                <p class="mt-2 text-sm text-gray-400">
                    Sign in to
                    <span class="font-medium text-gray-300">{{ serverName }}</span>
                </p>
                <p class="mt-0.5 text-xs text-gray-600">{{ serverHost }}</p>
            </div>

            <!-- Login Form -->
            <form @submit.prevent="handleLogin" class="space-y-4">
                <div>
                    <label for="email" class="mb-1.5 block text-sm font-medium text-gray-300">
                        Email
                    </label>
                    <input
                        id="email"
                        v-model="email"
                        type="email"
                        placeholder="you@example.com"
                        autocomplete="email"
                        :disabled="authStore.isLoggingIn"
                        class="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-white placeholder-gray-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                    />
                </div>

                <div>
                    <label for="password" class="mb-1.5 block text-sm font-medium text-gray-300">
                        Password
                    </label>
                    <div class="relative">
                        <input
                            id="password"
                            v-model="password"
                            :type="showPassword ? 'text' : 'password'"
                            placeholder="••••••••"
                            autocomplete="current-password"
                            :disabled="authStore.isLoggingIn"
                            class="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 pr-10 text-sm text-white placeholder-gray-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
                        />
                        <button
                            type="button"
                            @click="showPassword = !showPassword"
                            class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                            tabindex="-1"
                        >
                            <span class="text-xs">{{ showPassword ? 'HIDE' : 'SHOW' }}</span>
                        </button>
                    </div>
                </div>

                <!-- Error -->
                <div
                    v-if="authStore.loginError"
                    class="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-400"
                >
                    {{ authStore.loginError }}
                </div>

                <!-- Actions -->
                <div class="flex flex-col gap-3 pt-2">
                    <button
                        type="submit"
                        :disabled="!canSubmit"
                        class="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <span v-if="authStore.isLoggingIn">Signing in...</span>
                        <span v-else>Sign In</span>
                    </button>
                    <button
                        type="button"
                        @click="goBack"
                        class="text-sm text-gray-500 transition hover:text-gray-300"
                    >
                        &larr; Change server
                    </button>
                </div>
            </form>
        </div>
    </div>
</template>
