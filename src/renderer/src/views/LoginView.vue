<script setup lang="ts">
import { ArrowLeftIcon, EyeIcon, EyeOffIcon, Loader2Icon } from 'lucide-vue-next';
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

const loginSchema = computed(() =>
    z.object({
        email: z.string().min(1, t('validation.emailRequired')).email(t('validation.emailInvalid')),
        password: z.string().min(1, t('validation.passwordRequired')),
    }),
);

type FieldErrors = Partial<Record<keyof z.infer<typeof loginSchema.value>, string>>;

const router = useRouter();
const authStore = useAuthStore();
const serverStore = useServerStore();

const email = ref('');
const password = ref('');
const showPassword = ref(false);
const fieldErrors = ref<FieldErrors>({});

const serverName = computed(() => serverStore.activeServer?.name ?? t('auth.serverFallback'));
const serverHost = computed(() => serverStore.activeServer?.host ?? '');

const canSubmit = computed(() => email.value.trim() !== '' && password.value !== '' && !authStore.isLoggingIn);

onMounted(() => {
    if (!serverStore.activeServer) {
        router.replace({ name: 'server-connect' });
    }
});

async function handleLogin(): Promise<void> {
    fieldErrors.value = {};

    const result = loginSchema.value.safeParse({ email: email.value.trim(), password: password.value });
    if (!result.success) {
        result.error.issues.forEach((e: z.ZodIssue) => {
            const field = e.path[0] as keyof FieldErrors;
            if (!fieldErrors.value[field]) fieldErrors.value[field] = e.message;
        });
        return;
    }

    const loginResult = await authStore.login(result.data.email, result.data.password);

    if (loginResult === 'two-factor') {
        router.push({ name: 'two-factor-challenge' });
    } else if (loginResult === true) {
        router.push({ name: 'home' });
    }
}

function goBack(): void {
    router.push({ name: 'server-connect' });
}
</script>

<template>
    <AuthLayout :title="t('auth.login.title')" :description="t('auth.login.descriptionPrefix', { server: serverName })">
        <p class="text-muted-foreground/60 -mt-6 text-center text-xs">{{ serverHost }}</p>

        <form @submit.prevent="handleLogin" class="space-y-5">
            <div class="grid gap-2">
                <Label for="email">{{ t('auth.login.email') }}</Label>
                <Input
                    id="email"
                    v-model="email"
                    type="email"
                    :placeholder="t('auth.login.emailPlaceholder')"
                    autocomplete="email"
                    :disabled="authStore.isLoggingIn"
                    :class="{ 'border-destructive': fieldErrors.email }"
                />
                <p v-if="fieldErrors.email" class="text-destructive text-xs">{{ fieldErrors.email }}</p>
            </div>

            <div class="grid gap-2">
                <Label for="password">{{ t('auth.login.password') }}</Label>
                <div class="relative">
                    <Input
                        id="password"
                        v-model="password"
                        :type="showPassword ? 'text' : 'password'"
                        :placeholder="t('auth.login.passwordPlaceholder')"
                        autocomplete="current-password"
                        :disabled="authStore.isLoggingIn"
                        class="pr-10"
                        :class="{ 'border-destructive': fieldErrors.password }"
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
                <p v-if="fieldErrors.password" class="text-destructive text-xs">{{ fieldErrors.password }}</p>
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
                    <span v-if="authStore.isLoggingIn">{{ t('auth.login.signingIn') }}</span>
                    <span v-else>{{ t('auth.login.signIn') }}</span>
                </Button>
                <router-link
                    :to="{ name: 'forgot-password' }"
                    class="text-muted-foreground hover:text-foreground text-center text-sm transition-colors"
                >
                    {{ t('auth.login.forgotPassword') }}
                </router-link>
                <router-link
                    :to="{ name: 'register' }"
                    class="text-muted-foreground hover:text-foreground text-center text-sm transition-colors"
                >
                    {{ t('auth.login.noAccount') }}
                </router-link>
                <Button type="button" variant="link" class="text-muted-foreground" @click="goBack">
                    <ArrowLeftIcon class="size-3" />
                    {{ t('auth.login.changeServer') }}
                </Button>
            </div>
        </form>
    </AuthLayout>
</template>
