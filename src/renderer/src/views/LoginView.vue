<script setup lang="ts">
import { ArrowLeftIcon, EyeIcon, EyeOffIcon, Loader2Icon } from 'lucide-vue-next';
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AuthLayout from '@/layouts/AuthLayout.vue';
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

const canSubmit = computed(() => email.value.trim() !== '' && password.value !== '' && !authStore.isLoggingIn);

onMounted(() => {
    if (!serverStore.activeServer) {
        router.replace({ name: 'server-connect' });
    }
});

async function handleLogin(): Promise<void> {
    if (!canSubmit.value) return;

    const result = await authStore.login(email.value.trim(), password.value);

    if (result === 'two-factor') {
        router.push({ name: 'two-factor-challenge' });
    } else if (result === true) {
        router.push({ name: 'home' });
    }
}

function goBack(): void {
    router.push({ name: 'server-connect' });
}
</script>

<template>
    <AuthLayout title="Welcome Back" :description="`Sign in to ${serverName}`">
        <p class="text-muted-foreground/60 -mt-6 text-center text-xs">{{ serverHost }}</p>

        <form @submit.prevent="handleLogin" class="space-y-5">
            <div class="grid gap-2">
                <Label for="email">Email</Label>
                <Input
                    id="email"
                    v-model="email"
                    type="email"
                    placeholder="you@example.com"
                    autocomplete="email"
                    :disabled="authStore.isLoggingIn"
                />
            </div>

            <div class="grid gap-2">
                <Label for="password">Password</Label>
                <div class="relative">
                    <Input
                        id="password"
                        v-model="password"
                        :type="showPassword ? 'text' : 'password'"
                        placeholder="••••••••"
                        autocomplete="current-password"
                        :disabled="authStore.isLoggingIn"
                        class="pr-10"
                    />
                    <button
                        type="button"
                        @click="showPassword = !showPassword"
                        class="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
                        tabindex="-1"
                    >
                        <EyeOffIcon v-if="showPassword" class="size-4" />
                        <EyeIcon v-else class="size-4" />
                    </button>
                </div>
            </div>

            <div
                v-if="authStore.loginError"
                class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
            >
                {{ authStore.loginError }}
            </div>

            <div class="flex flex-col gap-3 pt-1">
                <Button type="submit" :disabled="!canSubmit" class="w-full">
                    <Loader2Icon v-if="authStore.isLoggingIn" class="animate-spin" />
                    <span v-if="authStore.isLoggingIn">Signing in...</span>
                    <span v-else>Sign In</span>
                </Button>
                <router-link
                    :to="{ name: 'forgot-password' }"
                    class="text-muted-foreground hover:text-foreground text-center text-sm transition-colors"
                >
                    Forgot your password?
                </router-link>
                <Button type="button" variant="link" class="text-muted-foreground" @click="goBack">
                    <ArrowLeftIcon class="size-3" />
                    Change server
                </Button>
            </div>
        </form>
    </AuthLayout>
</template>
