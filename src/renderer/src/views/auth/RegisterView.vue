<script setup lang="ts">
import { ArrowLeftIcon, EyeIcon, EyeOffIcon, Loader2Icon, TicketIcon } from 'lucide-vue-next';
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

const step = ref<'invite' | 'form'>('invite');

const inviteToken = ref('');
const name = ref('');
const username = ref('');
const email = ref('');
const password = ref('');
const passwordConfirmation = ref('');
const showPassword = ref(false);

const isValidating = ref(false);
const error = ref<string | null>(null);

const serverName = computed(() => serverStore.activeServer?.name ?? 'Server');
const serverHost = computed(() => serverStore.activeServer?.host ?? '');

const canSubmitInvite = computed(() => inviteToken.value.trim().length > 0 && !isValidating.value);

const canSubmitForm = computed(
    () =>
        name.value.trim() !== '' &&
        username.value.trim() !== '' &&
        email.value.trim() !== '' &&
        password.value.length >= 8 &&
        password.value === passwordConfirmation.value &&
        !authStore.isLoggingIn,
);

onMounted(() => {
    if (!serverStore.activeServer) {
        router.replace({ name: 'server-connect' });
    }
});

async function handleValidateInvite(): Promise<void> {
    if (!canSubmitInvite.value || !serverStore.activeServer) return;

    isValidating.value = true;
    error.value = null;

    try {
        const result = await window.api.auth.validateInvite(serverStore.activeServer.host, inviteToken.value.trim());

        if (result.success) {
            step.value = 'form';
        } else {
            error.value = result.error ?? 'Invalid invite link';
        }
    } catch {
        error.value = 'Unable to reach the server. Please try again later.';
    } finally {
        isValidating.value = false;
    }
}

async function handleRegister(): Promise<void> {
    if (!canSubmitForm.value) return;

    authStore.clearError();
    error.value = null;

    const result = await authStore.register(
        inviteToken.value.trim(),
        name.value.trim(),
        username.value.trim(),
        email.value.trim(),
        password.value,
        passwordConfirmation.value,
    );

    if (result) {
        router.push({ name: 'home' });
    } else {
        error.value = authStore.loginError;
    }
}

function goBackToInvite(): void {
    step.value = 'invite';
    error.value = null;
}

function goToLogin(): void {
    router.push({ name: 'login' });
}
</script>

<template>
    <AuthLayout
        :title="step === 'invite' ? 'Join Server' : 'Create Account'"
        :description="step === 'invite' ? 'Enter your invite code to get started' : `Sign up for ${serverName}`"
    >
        <p v-if="step === 'form'" class="text-muted-foreground/60 -mt-6 text-center text-xs">
            {{ serverHost }}
        </p>

        <form v-if="step === 'invite'" @submit.prevent="handleValidateInvite" class="space-y-5">
            <div class="grid gap-2">
                <Label for="invite_token">Invite Code</Label>
                <div class="relative">
                    <TicketIcon class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                    <Input
                        id="invite_token"
                        v-model="inviteToken"
                        type="text"
                        placeholder="Paste your invite code"
                        autocomplete="off"
                        class="pl-9"
                        :disabled="isValidating"
                        autofocus
                    />
                </div>
                <p class="text-muted-foreground text-xs">Ask a server admin for an invite code.</p>
            </div>

            <div
                v-if="error"
                class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
            >
                {{ error }}
            </div>

            <div class="flex flex-col gap-3 pt-1">
                <Button type="submit" :disabled="!canSubmitInvite" class="w-full">
                    <Loader2Icon v-if="isValidating" class="animate-spin" />
                    <span v-if="isValidating">Validating...</span>
                    <span v-else>Continue</span>
                </Button>
                <Button type="button" variant="link" class="text-muted-foreground" @click="goToLogin">
                    <ArrowLeftIcon class="size-3" />
                    Already have an account? Sign in
                </Button>
            </div>
        </form>

        <form v-else @submit.prevent="handleRegister" class="space-y-5">
            <div class="grid gap-2">
                <Label for="name">Display Name</Label>
                <Input
                    id="name"
                    v-model="name"
                    type="text"
                    placeholder="Your Name"
                    autocomplete="name"
                    :disabled="authStore.isLoggingIn"
                    autofocus
                />
            </div>

            <div class="grid gap-2">
                <Label for="username">Username</Label>
                <Input
                    id="username"
                    v-model="username"
                    type="text"
                    placeholder="yourname"
                    autocomplete="username"
                    :disabled="authStore.isLoggingIn"
                />
            </div>

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
                        autocomplete="new-password"
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

            <div class="grid gap-2">
                <Label for="password_confirmation">Confirm Password</Label>
                <Input
                    id="password_confirmation"
                    v-model="passwordConfirmation"
                    :type="showPassword ? 'text' : 'password'"
                    placeholder="••••••••"
                    autocomplete="new-password"
                    :disabled="authStore.isLoggingIn"
                />
            </div>

            <div
                v-if="error"
                class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
            >
                {{ error }}
            </div>

            <div class="flex flex-col gap-3 pt-1">
                <Button type="submit" :disabled="!canSubmitForm" class="w-full">
                    <Loader2Icon v-if="authStore.isLoggingIn" class="animate-spin" />
                    <span v-if="authStore.isLoggingIn">Creating account...</span>
                    <span v-else>Create Account</span>
                </Button>
                <Button type="button" variant="link" class="text-muted-foreground" @click="goBackToInvite">
                    <ArrowLeftIcon class="size-3" />
                    Use a different invite code
                </Button>
            </div>
        </form>
    </AuthLayout>
</template>
