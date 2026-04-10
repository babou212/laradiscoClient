<script setup lang="ts">
import { ArrowLeftIcon, KeyIcon } from 'lucide-vue-next';
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputOtp } from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import AuthLayout from '@/layouts/AuthLayout.vue';
import { useAuthStore } from '@/stores/auth';

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
        :title="useRecoveryCode ? 'Recovery Code' : 'Two-Factor Authentication'"
        :description="
            useRecoveryCode
                ? 'Enter one of your emergency recovery codes to verify your identity.'
                : 'Enter the 6-digit code from your authenticator app to continue.'
        "
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
                <Label for="recovery_code">Recovery Code</Label>
                <div class="relative">
                    <KeyIcon class="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                    <Input
                        id="recovery_code"
                        ref="recoveryInput"
                        v-model="recoveryCode"
                        type="text"
                        autocomplete="off"
                        placeholder="xxxxx-xxxxx"
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
                    {{ useRecoveryCode ? 'Use authentication code instead' : 'Use a recovery code instead' }}
                </Button>

                <Button type="button" variant="link" class="text-muted-foreground" @click="goBack">
                    <ArrowLeftIcon class="size-3" />
                    Back to login
                </Button>
            </div>
        </form>
    </AuthLayout>
</template>
