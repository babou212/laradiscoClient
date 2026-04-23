<script setup lang="ts">
import { ArrowLeftIcon, KeyIcon } from 'lucide-vue-next';
import { ref, computed, onMounted, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputOtp } from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import AuthLayout from '@/layouts/AuthLayout.vue';
import { useAuthStore } from '@/stores/auth';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();

const useRecoveryCode = ref(false);
const code = ref('');
const recoveryCode = ref('');
const recoveryInput = ref<InstanceType<typeof Input> | null>(null);

const canSubmit = computed(() => {
    if (authStore.isLoggingIn) return false;
    return useRecoveryCode.value ? recoveryCode.value.trim() !== '' : code.value.trim().length === 6;
});

onMounted(() => {
    if (!authStore.challengeToken) {
        router.replace({ name: 'login' });
    }
});

async function handleSubmit(): Promise<void> {
    if (!canSubmit.value || !authStore.challengeToken) return;

    const success = await authStore.verifyTwoFactor(
        useRecoveryCode.value ? null : code.value.trim(),
        useRecoveryCode.value ? recoveryCode.value.trim() : null,
    );

    if (success) {
        router.push({ name: 'home' });
    }
}

async function toggleMode(): Promise<void> {
    useRecoveryCode.value = !useRecoveryCode.value;
    authStore.clearError();
    code.value = '';
    recoveryCode.value = '';

    await nextTick();
    if (useRecoveryCode.value) {
        (recoveryInput.value?.$el as HTMLInputElement)?.focus();
    }
}

function goBack(): void {
    authStore.clearError();
    router.push({ name: 'login' });
}
</script>

<template>
    <AuthLayout
        :title="useRecoveryCode ? t('auth.twoFactor.recoveryTitle') : t('auth.twoFactor.title')"
        :description="useRecoveryCode ? t('auth.twoFactor.recoveryDescription') : t('auth.twoFactor.description')"
    >
        <form @submit.prevent="handleSubmit" class="space-y-5">
            <div v-if="!useRecoveryCode" class="grid gap-2">
                <div class="flex justify-center">
                    <InputOtp
                        v-model="code"
                        :maxlength="6"
                        :disabled="authStore.isLoggingIn"
                        @complete="handleSubmit"
                    />
                </div>
            </div>

            <div v-else class="grid gap-2">
                <Label for="recovery_code">{{ t('auth.twoFactor.recoveryCode') }}</Label>
                <div class="relative">
                    <KeyIcon class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                    <Input
                        id="recovery_code"
                        ref="recoveryInput"
                        v-model="recoveryCode"
                        type="text"
                        autocomplete="off"
                        :placeholder="t('auth.twoFactor.recoveryPlaceholder')"
                        class="pl-9 font-mono"
                        :disabled="authStore.isLoggingIn"
                    />
                </div>
            </div>

            <div
                v-if="authStore.loginError"
                class="border-destructive/50 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm"
            >
                {{ authStore.loginError }}
            </div>

            <div class="flex flex-col gap-3 pt-1">
                <Button type="button" variant="ghost" size="sm" class="text-muted-foreground" @click="toggleMode">
                    {{ useRecoveryCode ? t('auth.twoFactor.useAuthInstead') : t('auth.twoFactor.useRecoveryInstead') }}
                </Button>

                <Button type="button" variant="link" class="text-muted-foreground" @click="goBack">
                    <ArrowLeftIcon class="size-3" />
                    {{ t('auth.twoFactor.backToLogin') }}
                </Button>
            </div>
        </form>
    </AuthLayout>
</template>
