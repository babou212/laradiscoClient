<script setup lang="ts">
import { ArrowLeftIcon, EyeIcon, EyeOffIcon, Loader2Icon, TicketIcon } from 'lucide-vue-next';
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
const inviteFieldErrors = ref<InviteFieldErrors>({});
const registerFieldErrors = ref<RegisterFieldErrors>({});

const serverName = computed(() => serverStore.activeServer?.name ?? t('auth.serverFallback'));
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
        router.push({ name: 'home' });
    } else {
        error.value = authStore.loginError;
    }
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
    <AuthLayout
        :title="step === 'invite' ? t('auth.register.joinTitle') : t('auth.register.createTitle')"
        :description="
            step === 'invite'
                ? t('auth.register.inviteDescription')
                : t('auth.register.signupDescription', { server: serverName })
        "
    >
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

        <form v-else @submit.prevent="handleRegister" class="space-y-5">
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
    </AuthLayout>
</template>
