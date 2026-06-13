<script setup lang="ts">
import { useClipboard } from '@vueuse/core';
import DOMPurify from 'dompurify';
import { ArrowLeftIcon, Check, Copy, EyeIcon, EyeOffIcon, Loader2Icon, ShieldCheck, TicketIcon } from 'lucide-vue-next';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { z } from 'zod';
import { enableTwoFactor as apiEnableTwoFactor, confirmTwoFactor as apiConfirmTwoFactor } from '@/api/two-factor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputOtp } from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { isDarkTheme, useAppearance } from '@/composables/useAppearance';
import { useTwoFactorAuth } from '@/composables/useTwoFactorAuth';
import AuthLayout from '@/layouts/AuthLayout.vue';
import { useAuthStore } from '@/stores/auth';
import { useServerStore } from '@/stores/server';

const { t } = useI18n();

const inviteSchema = computed(() =>
    z.object({
        inviteToken: z.string().min(1, t('validation.inviteRequired')),
    }),
);

const registerSchema = computed(() =>
    z
        .object({
            name: z.string().min(1, t('validation.displayNameRequired')),
            username: z
                .string()
                .min(1, t('validation.usernameRequired'))
                .regex(/^[a-z0-9_.-]+$/i, t('validation.usernameInvalidChars')),
            email: z.string().min(1, t('validation.emailRequired')).email(t('validation.emailInvalid')),
            password: z.string().min(8, t('validation.passwordMin8')),
            passwordConfirmation: z.string().min(1, t('validation.passwordConfirmRequired')),
        })
        .refine((d) => d.password === d.passwordConfirmation, {
            message: t('validation.passwordsMatch'),
            path: ['passwordConfirmation'],
        }),
);

type InviteFieldErrors = Partial<Record<keyof z.infer<typeof inviteSchema.value>, string>>;
type RegisterFieldErrors = Partial<Record<keyof z.infer<typeof registerSchema.value>, string>>;
type Step = 'invite' | 'form' | 'twofa-prompt' | 'twofa-setup' | 'twofa-recovery';

const router = useRouter();
const authStore = useAuthStore();
const serverStore = useServerStore();
const { theme } = useAppearance();

const { qrCodeSvg, manualSetupKey, recoveryCodesList, fetchSetupData, fetchRecoveryCodes, clearTwoFactorAuthData } =
    useTwoFactorAuth();

const { copy, copied } = useClipboard();

const step = ref<Step>('invite');

const inviteToken = ref('');
const name = ref('');
const username = ref('');
const email = ref('');
const password = ref('');
const passwordConfirmation = ref('');
const showPassword = ref(false);

const isValidating = ref(false);
const error = ref<string | null>(null);
const inviteFieldErrors = ref<InviteFieldErrors>({});
const registerFieldErrors = ref<RegisterFieldErrors>({});

// Two-factor setup state
const code = ref('');
const codeError = ref('');
const processing = ref(false);

const serverName = computed(() => serverStore.activeServer?.name ?? t('auth.serverFallback'));
const serverHost = computed(() => serverStore.activeServer?.host ?? '');

const sanitizedQrCodeSvg = computed(() => {
    if (!qrCodeSvg.value) return null;
    return DOMPurify.sanitize(qrCodeSvg.value, {
        USE_PROFILES: { svg: true },
        ADD_TAGS: ['svg', 'path', 'rect', 'circle', 'g', 'defs', 'use'],
        FORBID_TAGS: ['script', 'foreignObject', 'animate', 'set'],
        FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover'],
    });
});

const layoutTitle = computed(() => {
    switch (step.value) {
        case 'invite':
            return t('auth.register.joinTitle');
        case 'form':
            return t('auth.register.createTitle');
        case 'twofa-prompt':
            return t('auth.register.twoFactor.promptTitle');
        case 'twofa-setup':
            return t('auth.register.twoFactor.scanTitle');
        case 'twofa-recovery':
            return t('auth.register.twoFactor.recoveryTitle');
        default:
            return '';
    }
});

const layoutDescription = computed(() => {
    switch (step.value) {
        case 'invite':
            return t('auth.register.inviteDescription');
        case 'form':
            return t('auth.register.signupDescription', { server: serverName.value });
        case 'twofa-prompt':
            return t('auth.register.twoFactor.promptBody');
        case 'twofa-setup':
            return t('auth.register.twoFactor.scanDescription');
        case 'twofa-recovery':
            return t('auth.register.twoFactor.recoveryBody');
        default:
            return '';
    }
});

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

onUnmounted(() => {
    clearTwoFactorAuthData();
});

async function handleValidateInvite(): Promise<void> {
    inviteFieldErrors.value = {};
    error.value = null;

    const result = inviteSchema.value.safeParse({ inviteToken: inviteToken.value.trim() });
    if (!result.success) {
        result.error.issues.forEach((e: z.ZodIssue) => {
            const field = e.path[0] as keyof InviteFieldErrors;
            if (!inviteFieldErrors.value[field]) inviteFieldErrors.value[field] = e.message;
        });
        return;
    }

    if (!serverStore.activeServer) return;

    isValidating.value = true;

    try {
        const validateResult = await window.api.auth.validateInvite(
            serverStore.activeServer.host,
            result.data.inviteToken,
        );

        if (validateResult.success) {
            step.value = 'form';
        } else {
            error.value = validateResult.error ?? t('auth.register.invalidInvite');
        }
    } catch {
        error.value = t('auth.register.unableToReach');
    } finally {
        isValidating.value = false;
    }
}

async function handleRegister(): Promise<void> {
    registerFieldErrors.value = {};
    authStore.clearError();
    error.value = null;

    const result = registerSchema.value.safeParse({
        name: name.value.trim(),
        username: username.value.trim(),
        email: email.value.trim(),
        password: password.value,
        passwordConfirmation: passwordConfirmation.value,
    });
    if (!result.success) {
        result.error.issues.forEach((e: z.ZodIssue) => {
            const field = e.path[0] as keyof RegisterFieldErrors;
            if (!registerFieldErrors.value[field]) registerFieldErrors.value[field] = e.message;
        });
        return;
    }

    const registerResult = await authStore.register(
        inviteToken.value.trim(),
        result.data.name,
        result.data.username,
        result.data.email,
        result.data.password,
        result.data.passwordConfirmation,
    );

    if (registerResult) {
        // The account is created and the user is authenticated. Offer optional 2FA
        // setup before sending them into the app.
        step.value = 'twofa-prompt';
    } else {
        error.value = authStore.loginError;
    }
}

async function goToTwoFactorSetup(): Promise<void> {
    processing.value = true;
    error.value = null;
    try {
        await apiEnableTwoFactor();
        await fetchSetupData();
        step.value = 'twofa-setup';
    } catch {
        error.value = t('auth.register.twoFactor.enableFailed');
    } finally {
        processing.value = false;
    }
}

async function confirmSetup(): Promise<void> {
    if (code.value.length < 6 || processing.value) return;
    processing.value = true;
    codeError.value = '';
    try {
        await apiConfirmTwoFactor(code.value);
        await fetchRecoveryCodes();
        code.value = '';
        step.value = 'twofa-recovery';
    } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { error?: string } } };
        codeError.value = axiosErr.response?.data?.error ?? t('auth.register.twoFactor.invalidCode');
        code.value = '';
    } finally {
        processing.value = false;
    }
}

function copyRecoveryCodes(): void {
    copy(recoveryCodesList.value.join('\n'));
}

function finish(): void {
    router.push({ name: 'home' });
}

function goBackToInvite(): void {
    step.value = 'invite';
    error.value = null;
    registerFieldErrors.value = {};
}

function goToLogin(): void {
    router.push({ name: 'login' });
}
</script>

<template>
    <AuthLayout :title="layoutTitle" :description="layoutDescription">
        <p v-if="step === 'form'" class="text-muted-foreground/60 -mt-6 text-center text-xs">
            {{ serverHost }}
        </p>

        <form v-if="step === 'invite'" @submit.prevent="handleValidateInvite" class="space-y-5">
            <div class="grid gap-2">
                <Label for="invite_token">{{ t('auth.register.inviteCodeLabel') }}</Label>
                <div class="relative">
                    <TicketIcon class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                    <Input
                        id="invite_token"
                        v-model="inviteToken"
                        type="text"
                        :placeholder="t('auth.register.invitePlaceholder')"
                        autocomplete="off"
                        class="pl-9"
                        :class="{ 'border-destructive': inviteFieldErrors.inviteToken }"
                        :disabled="isValidating"
                        autofocus
                    />
                </div>
                <p v-if="inviteFieldErrors.inviteToken" class="text-destructive text-xs">
                    {{ inviteFieldErrors.inviteToken }}
                </p>
                <p v-else class="text-muted-foreground text-xs">{{ t('auth.register.askAdmin') }}</p>
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
                    <span v-if="isValidating">{{ t('auth.register.validating') }}</span>
                    <span v-else>{{ t('auth.register.continue') }}</span>
                </Button>
                <Button type="button" variant="link" class="text-muted-foreground" @click="goToLogin">
                    <ArrowLeftIcon class="size-3" />
                    {{ t('auth.register.alreadyHaveAccount') }}
                </Button>
            </div>
        </form>

        <form v-else-if="step === 'form'" @submit.prevent="handleRegister" class="space-y-5">
            <div class="grid gap-2">
                <Label for="name">{{ t('auth.register.displayName') }}</Label>
                <Input
                    id="name"
                    v-model="name"
                    type="text"
                    :placeholder="t('auth.register.displayNamePlaceholder')"
                    autocomplete="name"
                    :disabled="authStore.isLoggingIn"
                    :class="{ 'border-destructive': registerFieldErrors.name }"
                    autofocus
                />
                <p v-if="registerFieldErrors.name" class="text-destructive text-xs">{{ registerFieldErrors.name }}</p>
            </div>

            <div class="grid gap-2">
                <Label for="username">{{ t('auth.register.username') }}</Label>
                <Input
                    id="username"
                    v-model="username"
                    type="text"
                    :placeholder="t('auth.register.usernamePlaceholder')"
                    autocomplete="username"
                    :disabled="authStore.isLoggingIn"
                    :class="{ 'border-destructive': registerFieldErrors.username }"
                />
                <p v-if="registerFieldErrors.username" class="text-destructive text-xs">
                    {{ registerFieldErrors.username }}
                </p>
            </div>

            <div class="grid gap-2">
                <Label for="email">{{ t('auth.register.email') }}</Label>
                <Input
                    id="email"
                    v-model="email"
                    type="email"
                    :placeholder="t('auth.register.emailPlaceholder')"
                    autocomplete="email"
                    :disabled="authStore.isLoggingIn"
                    :class="{ 'border-destructive': registerFieldErrors.email }"
                />
                <p v-if="registerFieldErrors.email" class="text-destructive text-xs">{{ registerFieldErrors.email }}</p>
            </div>

            <div class="grid gap-2">
                <Label for="password">{{ t('auth.register.password') }}</Label>
                <div class="relative">
                    <Input
                        id="password"
                        v-model="password"
                        :type="showPassword ? 'text' : 'password'"
                        :placeholder="t('auth.register.passwordPlaceholder')"
                        autocomplete="new-password"
                        :disabled="authStore.isLoggingIn"
                        class="pr-10"
                        :class="{ 'border-destructive': registerFieldErrors.password }"
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
                <p v-if="registerFieldErrors.password" class="text-destructive text-xs">
                    {{ registerFieldErrors.password }}
                </p>
            </div>

            <div class="grid gap-2">
                <Label for="password_confirmation">{{ t('auth.register.confirmPassword') }}</Label>
                <Input
                    id="password_confirmation"
                    v-model="passwordConfirmation"
                    :type="showPassword ? 'text' : 'password'"
                    :placeholder="t('auth.register.passwordPlaceholder')"
                    autocomplete="new-password"
                    :disabled="authStore.isLoggingIn"
                    :class="{ 'border-destructive': registerFieldErrors.passwordConfirmation }"
                />
                <p v-if="registerFieldErrors.passwordConfirmation" class="text-destructive text-xs">
                    {{ registerFieldErrors.passwordConfirmation }}
                </p>
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
                    <span v-if="authStore.isLoggingIn">{{ t('auth.register.creatingAccount') }}</span>
                    <span v-else>{{ t('auth.register.createAccount') }}</span>
                </Button>
                <Button type="button" variant="link" class="text-muted-foreground" @click="goBackToInvite">
                    <ArrowLeftIcon class="size-3" />
                    {{ t('auth.register.useDifferentInvite') }}
                </Button>
            </div>
        </form>

        <!-- Optional two-factor setup: offer it -->
        <div v-else-if="step === 'twofa-prompt'" class="space-y-5">
            <div class="flex justify-center">
                <div class="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-full">
                    <ShieldCheck class="size-7" />
                </div>
            </div>

            <div
                v-if="error"
                class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
            >
                {{ error }}
            </div>

            <div class="flex flex-col gap-3 pt-1">
                <Button type="button" :disabled="processing" class="w-full" @click="goToTwoFactorSetup">
                    <Loader2Icon v-if="processing" class="animate-spin" />
                    <ShieldCheck v-else class="size-4" />
                    {{ t('auth.register.twoFactor.enable') }}
                </Button>
                <Button type="button" variant="ghost" :disabled="processing" class="w-full" @click="finish">
                    {{ t('auth.register.twoFactor.skip') }}
                </Button>
                <p class="text-muted-foreground text-center text-xs">
                    {{ t('auth.register.twoFactor.skipHint') }}
                </p>
            </div>
        </div>

        <!-- Optional two-factor setup: scan QR / verify code -->
        <div v-else-if="step === 'twofa-setup'" class="flex flex-col items-center space-y-5">
            <div class="border-border relative mx-auto aspect-square w-56 overflow-hidden rounded-lg border">
                <div
                    v-if="!qrCodeSvg"
                    class="bg-background absolute inset-0 z-10 flex animate-pulse items-center justify-center"
                >
                    <Spinner class="size-6" />
                </div>
                <div v-else class="relative z-10 overflow-hidden p-4">
                    <div
                        v-html="sanitizedQrCodeSvg"
                        class="flex aspect-square size-full items-center justify-center"
                        :style="{ filter: isDarkTheme(theme) ? 'invert(1) brightness(1.5)' : undefined }"
                    />
                </div>
            </div>

            <div class="relative flex w-full items-center justify-center">
                <div class="bg-border absolute inset-0 top-1/2 h-px w-full" />
                <span class="bg-background text-muted-foreground relative px-2 py-1 text-sm">
                    {{ t('auth.register.twoFactor.orManual') }}
                </span>
            </div>

            <div class="border-border flex w-full items-stretch overflow-hidden rounded-xl border">
                <div v-if="!manualSetupKey" class="bg-muted flex h-full w-full items-center justify-center p-3">
                    <Spinner />
                </div>
                <template v-else>
                    <input
                        type="text"
                        readonly
                        :value="manualSetupKey"
                        class="bg-background text-foreground h-full w-full p-3 text-sm"
                    />
                    <button
                        type="button"
                        @click="copy(manualSetupKey || '')"
                        class="border-border hover:bg-muted relative block h-auto border-l px-3"
                    >
                        <Check v-if="copied" class="w-4 text-green-500" />
                        <Copy v-else class="w-4" />
                    </button>
                </template>
            </div>

            <form @submit.prevent="confirmSetup" class="w-full space-y-4">
                <p class="text-muted-foreground text-center text-sm">
                    {{ t('auth.register.twoFactor.verifyDescription') }}
                </p>
                <div class="flex w-full flex-col items-center justify-center space-y-3">
                    <InputOtp v-model="code" :maxlength="6" :disabled="processing" @complete="confirmSetup" />
                    <p v-if="codeError" class="text-destructive text-xs">{{ codeError }}</p>
                </div>

                <div class="flex flex-col gap-3 pt-1">
                    <Button type="submit" class="w-full" :disabled="processing || code.length < 6">
                        <Loader2Icon v-if="processing" class="animate-spin" />
                        <span>{{ t('auth.register.twoFactor.confirm') }}</span>
                    </Button>
                    <Button type="button" variant="ghost" class="w-full" :disabled="processing" @click="finish">
                        {{ t('auth.register.twoFactor.skip') }}
                    </Button>
                </div>
            </form>
        </div>

        <!-- Optional two-factor setup: recovery codes -->
        <div v-else-if="step === 'twofa-recovery'" class="space-y-5">
            <div class="bg-muted grid gap-1 rounded-lg p-4 font-mono text-sm">
                <div v-if="!recoveryCodesList.length" class="space-y-2">
                    <div v-for="n in 8" :key="n" class="bg-muted-foreground/20 h-4 animate-pulse rounded" />
                </div>
                <div v-else v-for="(rc, index) in recoveryCodesList" :key="index">
                    {{ rc }}
                </div>
            </div>

            <div class="flex flex-col gap-3 pt-1">
                <Button type="button" variant="outline" class="w-full" @click="copyRecoveryCodes">
                    <Check v-if="copied" class="size-4 text-green-500" />
                    <Copy v-else class="size-4" />
                    {{ copied ? t('auth.register.twoFactor.copied') : t('auth.register.twoFactor.copyCodes') }}
                </Button>
                <Button type="button" class="w-full" :disabled="!recoveryCodesList.length" @click="finish">
                    {{ t('auth.register.twoFactor.recoveryContinue') }}
                </Button>
            </div>
        </div>
    </AuthLayout>
</template>
