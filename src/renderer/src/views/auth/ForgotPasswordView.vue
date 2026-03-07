<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useServerStore } from '@/stores/server';
import {
    ArrowLeftIcon,
    Loader2Icon,
    MailIcon,
    EyeIcon,
    EyeOffIcon,
    ShieldCheckIcon,
    CheckCircle2Icon,
} from 'lucide-vue-next';
import AuthLayout from '@/layouts/AuthLayout.vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import api from '@/lib/api';
import axios from 'axios';

const router = useRouter();
const serverStore = useServerStore();

const step = ref<'email' | 'code' | 'done'>('email');

const email = ref('');
const code = ref('');
const password = ref('');
const passwordConfirmation = ref('');
const showPassword = ref(false);
const isSubmitting = ref(false);
const error = ref<string | null>(null);

const canSubmitEmail = computed(() => email.value.trim() !== '' && !isSubmitting.value);

const canSubmitReset = computed(
    () =>
        code.value.trim().length === 6 &&
        password.value.length >= 8 &&
        password.value === passwordConfirmation.value &&
        !isSubmitting.value,
);

onMounted(() => {
    if (!serverStore.activeServer) {
        router.replace({ name: 'server-connect' });
    }
});

async function handleSendCode(): Promise<void> {
    if (!canSubmitEmail.value) return;

    isSubmitting.value = true;
    error.value = null;

    try {
        await api.post('/auth/forgot-password', {
            email: email.value.trim(),
        });
        step.value = 'code';
    } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 422) {
            const messages = err.response.data?.errors;
            error.value = messages?.email?.[0] ?? 'Please enter a valid email address.';
        } else if (axios.isAxiosError(err) && err.response?.status === 429) {
            error.value = 'Too many requests. Please wait a moment and try again.';
        } else {
            error.value = 'Unable to reach the server. Please try again later.';
        }
    } finally {
        isSubmitting.value = false;
    }
}

async function handleReset(): Promise<void> {
    if (!canSubmitReset.value) return;

    isSubmitting.value = true;
    error.value = null;

    try {
        await api.post('/auth/reset-password', {
            email: email.value.trim(),
            code: code.value.trim(),
            password: password.value,
            password_confirmation: passwordConfirmation.value,
        });
        step.value = 'done';
    } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 422) {
            const messages = err.response.data?.errors;
            error.value =
                messages?.code?.[0] ?? messages?.password?.[0] ?? messages?.email?.[0] ?? 'Invalid input.';
        } else if (axios.isAxiosError(err) && err.response?.status === 429) {
            error.value = 'Too many requests. Please wait a moment and try again.';
        } else {
            error.value = 'Unable to reach the server. Please try again later.';
        }
    } finally {
        isSubmitting.value = false;
    }
}

function goBack(): void {
    router.push({ name: 'login' });
}
</script>

<template>
    <AuthLayout
        :title="step === 'done' ? 'Password Reset' : 'Reset Password'"
        :description="
            step === 'email'
                ? 'Enter your email address and we\'ll send you a 6-digit reset code.'
                : step === 'code'
                  ? `Enter the code sent to ${email} and choose a new password.`
                  : ''
        "
    >
        <div v-if="step === 'done'" class="flex flex-col items-center gap-5 text-center">
            <div class="flex size-12 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle2Icon class="size-6 text-primary" />
            </div>
            <div class="space-y-2">
                <p class="text-sm text-foreground">Your password has been reset successfully.</p>
                <p class="text-xs text-muted-foreground">You can now sign in with your new password.</p>
            </div>
            <Button class="w-full" @click="goBack">Back to login</Button>
        </div>

        <form v-else-if="step === 'code'" @submit.prevent="handleReset" class="space-y-5">
            <div class="grid gap-2">
                <Label for="code">Reset Code</Label>
                <div class="relative">
                    <ShieldCheckIcon
                        class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                    />
                    <Input
                        id="code"
                        v-model="code"
                        type="text"
                        inputmode="numeric"
                        autocomplete="one-time-code"
                        placeholder="000000"
                        maxlength="6"
                        class="pl-9 tracking-widest text-center font-mono"
                        :disabled="isSubmitting"
                        autofocus
                    />
                </div>
            </div>

            <div class="grid gap-2">
                <Label for="password">New Password</Label>
                <div class="relative">
                    <Input
                        id="password"
                        v-model="password"
                        :type="showPassword ? 'text' : 'password'"
                        placeholder="••••••••"
                        autocomplete="new-password"
                        :disabled="isSubmitting"
                        class="pr-10"
                    />
                    <button
                        type="button"
                        @click="showPassword = !showPassword"
                        class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
                    :disabled="isSubmitting"
                />
            </div>

            <div
                v-if="error"
                class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
                {{ error }}
            </div>

            <div class="flex flex-col gap-3 pt-1">
                <Button type="submit" :disabled="!canSubmitReset" class="w-full">
                    <Loader2Icon v-if="isSubmitting" class="animate-spin" />
                    <span v-if="isSubmitting">Resetting...</span>
                    <span v-else>Reset Password</span>
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    class="text-muted-foreground"
                    @click="step = 'email'; code = ''; password = ''; passwordConfirmation = ''; error = null"
                >
                    Didn't receive a code? Try again
                </Button>
                <Button type="button" variant="link" class="text-muted-foreground" @click="goBack">
                    <ArrowLeftIcon class="size-3" />
                    Back to login
                </Button>
            </div>
        </form>

        <form v-else @submit.prevent="handleSendCode" class="space-y-5">
            <div class="grid gap-2">
                <Label for="email">Email</Label>
                <div class="relative">
                    <MailIcon
                        class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                    />
                    <Input
                        id="email"
                        v-model="email"
                        type="email"
                        placeholder="you@example.com"
                        autocomplete="email"
                        class="pl-9"
                        :disabled="isSubmitting"
                        autofocus
                    />
                </div>
            </div>

            <div
                v-if="error"
                class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
                {{ error }}
            </div>

            <div class="flex flex-col gap-3 pt-1">
                <Button type="submit" :disabled="!canSubmitEmail" class="w-full">
                    <Loader2Icon v-if="isSubmitting" class="animate-spin" />
                    <span v-if="isSubmitting">Sending...</span>
                    <span v-else>Send Reset Code</span>
                </Button>
                <Button type="button" variant="link" class="text-muted-foreground" @click="goBack">
                    <ArrowLeftIcon class="size-3" />
                    Back to login
                </Button>
            </div>
        </form>
    </AuthLayout>
</template>
