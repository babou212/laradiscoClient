<script setup lang="ts">
import axios from 'axios';
import {
    ArrowLeftIcon,
    Loader2Icon,
    MailIcon,
    EyeIcon,
    EyeOffIcon,
    ShieldCheckIcon,
    CheckCircle2Icon,
} from 'lucide-vue-next';
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { z } from 'zod';
import { forgotPassword, resetPassword } from '@/api/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AuthLayout from '@/layouts/AuthLayout.vue';
import { useServerStore } from '@/stores/server';

const { t } = useI18n();

const emailSchema = computed(() =>
    z.object({
        email: z.string().min(1, t('validation.emailRequired')).email(t('validation.emailInvalid')),
    }),
);

const resetSchema = computed(() =>
    z
        .object({
            code: z.string().length(6, t('validation.codeLength6')).regex(/^\d+$/, t('validation.codeNumeric')),
            password: z.string().min(8, t('validation.passwordMin8')),
            passwordConfirmation: z.string().min(1, t('validation.passwordConfirmRequired')),
        })
        .refine((d) => d.password === d.passwordConfirmation, {
            message: t('validation.passwordsMatch'),
            path: ['passwordConfirmation'],
        }),
);

type EmailFieldErrors = Partial<Record<keyof z.infer<typeof emailSchema.value>, string>>;
type ResetFieldErrors = Partial<Record<keyof z.infer<typeof resetSchema.value>, string>>;

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
const emailFieldErrors = ref<EmailFieldErrors>({});
const resetFieldErrors = ref<ResetFieldErrors>({});

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
    emailFieldErrors.value = {};
    error.value = null;

    const result = emailSchema.value.safeParse({ email: email.value.trim() });
    if (!result.success) {
        result.error.issues.forEach((e: z.ZodIssue) => {
            const field = e.path[0] as keyof EmailFieldErrors;
            if (!emailFieldErrors.value[field]) emailFieldErrors.value[field] = e.message;
        });
        return;
    }

    isSubmitting.value = true;

    try {
        await forgotPassword(result.data.email);
        step.value = 'code';
    } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 422) {
            const messages = err.response.data?.errors;
            error.value = messages?.email?.[0] ?? t('validation.emailInvalid');
        } else if (axios.isAxiosError(err) && err.response?.status === 429) {
            error.value = t('auth.forgot.tooManyRequests');
        } else {
            error.value = t('auth.forgot.unableToReach');
        }
    } finally {
        isSubmitting.value = false;
    }
}

async function handleReset(): Promise<void> {
    resetFieldErrors.value = {};
    error.value = null;

    const result = resetSchema.value.safeParse({
        code: code.value.trim(),
        password: password.value,
        passwordConfirmation: passwordConfirmation.value,
    });
    if (!result.success) {
        result.error.issues.forEach((e: z.ZodIssue) => {
            const field = e.path[0] as keyof ResetFieldErrors;
            if (!resetFieldErrors.value[field]) resetFieldErrors.value[field] = e.message;
        });
        return;
    }

    isSubmitting.value = true;

    try {
        await resetPassword({
            email: email.value.trim(),
            code: result.data.code,
            password: result.data.password,
            password_confirmation: result.data.passwordConfirmation,
        });
        step.value = 'done';
    } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 422) {
            const messages = err.response.data?.errors;
            error.value =
                messages?.code?.[0] ?? messages?.password?.[0] ?? messages?.email?.[0] ?? t('auth.forgot.invalidInput');
        } else if (axios.isAxiosError(err) && err.response?.status === 429) {
            error.value = t('auth.forgot.tooManyRequests');
        } else {
            error.value = t('auth.forgot.unableToReach');
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
        :title="step === 'done' ? t('auth.forgot.doneTitle') : t('auth.forgot.resetTitle')"
        :description="
            step === 'email'
                ? t('auth.forgot.emailDescription')
                : step === 'code'
                  ? t('auth.forgot.codeDescription', { email })
                  : ''
        "
    >
        <div v-if="step === 'done'" class="flex flex-col items-center gap-5 text-center">
            <div class="bg-primary/10 flex size-12 items-center justify-center rounded-full">
                <CheckCircle2Icon class="text-primary size-6" />
            </div>
            <div class="space-y-2">
                <p class="text-foreground text-sm">{{ t('auth.forgot.successHeading') }}</p>
                <p class="text-muted-foreground text-xs">{{ t('auth.forgot.successSub') }}</p>
            </div>
            <Button class="w-full" @click="goBack">{{ t('auth.forgot.backToLogin') }}</Button>
        </div>

        <form v-else-if="step === 'code'" @submit.prevent="handleReset" class="space-y-5">
            <div class="grid gap-2">
                <Label for="code">{{ t('auth.forgot.resetCode') }}</Label>
                <div class="relative">
                    <ShieldCheckIcon class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                    <Input
                        id="code"
                        v-model="code"
                        type="text"
                        inputmode="numeric"
                        autocomplete="one-time-code"
                        :placeholder="t('auth.forgot.codePlaceholder')"
                        maxlength="6"
                        class="pl-9 text-center font-mono tracking-widest"
                        :class="{ 'border-destructive': resetFieldErrors.code }"
                        :disabled="isSubmitting"
                        autofocus
                    />
                </div>
                <p v-if="resetFieldErrors.code" class="text-destructive text-xs">{{ resetFieldErrors.code }}</p>
            </div>

            <div class="grid gap-2">
                <Label for="password">{{ t('auth.forgot.newPassword') }}</Label>
                <div class="relative">
                    <Input
                        id="password"
                        v-model="password"
                        :type="showPassword ? 'text' : 'password'"
                        :placeholder="t('auth.forgot.passwordPlaceholder')"
                        autocomplete="new-password"
                        :disabled="isSubmitting"
                        class="pr-10"
                        :class="{ 'border-destructive': resetFieldErrors.password }"
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
                <p v-if="resetFieldErrors.password" class="text-destructive text-xs">{{ resetFieldErrors.password }}</p>
            </div>

            <div class="grid gap-2">
                <Label for="password_confirmation">{{ t('auth.forgot.confirmPassword') }}</Label>
                <Input
                    id="password_confirmation"
                    v-model="passwordConfirmation"
                    :type="showPassword ? 'text' : 'password'"
                    :placeholder="t('auth.forgot.passwordPlaceholder')"
                    autocomplete="new-password"
                    :disabled="isSubmitting"
                    :class="{ 'border-destructive': resetFieldErrors.passwordConfirmation }"
                />
                <p v-if="resetFieldErrors.passwordConfirmation" class="text-destructive text-xs">
                    {{ resetFieldErrors.passwordConfirmation }}
                </p>
            </div>

            <div
                v-if="error"
                class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
            >
                {{ error }}
            </div>

            <div class="flex flex-col gap-3 pt-1">
                <Button type="submit" :disabled="!canSubmitReset" class="w-full">
                    <Loader2Icon v-if="isSubmitting" class="animate-spin" />
                    <span v-if="isSubmitting">{{ t('auth.forgot.resetting') }}</span>
                    <span v-else>{{ t('auth.forgot.resetPassword') }}</span>
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    class="text-muted-foreground"
                    @click="
                        step = 'email';
                        code = '';
                        password = '';
                        passwordConfirmation = '';
                        error = null;
                        resetFieldErrors = {};
                    "
                >
                    {{ t('auth.forgot.tryAgain') }}
                </Button>
                <Button type="button" variant="link" class="text-muted-foreground" @click="goBack">
                    <ArrowLeftIcon class="size-3" />
                    {{ t('auth.forgot.backToLogin') }}
                </Button>
            </div>
        </form>

        <form v-else @submit.prevent="handleSendCode" class="space-y-5">
            <div class="grid gap-2">
                <Label for="email">{{ t('auth.forgot.email') }}</Label>
                <div class="relative">
                    <MailIcon class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                    <Input
                        id="email"
                        v-model="email"
                        type="email"
                        :placeholder="t('auth.forgot.emailPlaceholder')"
                        autocomplete="email"
                        class="pl-9"
                        :class="{ 'border-destructive': emailFieldErrors.email }"
                        :disabled="isSubmitting"
                        autofocus
                    />
                </div>
                <p v-if="emailFieldErrors.email" class="text-destructive text-xs">{{ emailFieldErrors.email }}</p>
            </div>

            <div
                v-if="error"
                class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
            >
                {{ error }}
            </div>

            <div class="flex flex-col gap-3 pt-1">
                <Button type="submit" :disabled="!canSubmitEmail" class="w-full">
                    <Loader2Icon v-if="isSubmitting" class="animate-spin" />
                    <span v-if="isSubmitting">{{ t('auth.forgot.sending') }}</span>
                    <span v-else>{{ t('auth.forgot.sendResetCode') }}</span>
                </Button>
                <Button type="button" variant="link" class="text-muted-foreground" @click="goBack">
                    <ArrowLeftIcon class="size-3" />
                    {{ t('auth.forgot.backToLogin') }}
                </Button>
            </div>
        </form>
    </AuthLayout>
</template>
