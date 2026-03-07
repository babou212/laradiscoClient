<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { ArrowLeftIcon, Loader2Icon, ShieldCheckIcon, KeyIcon } from 'lucide-vue-next';
import AuthLayout from '@/layouts/AuthLayout.vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const router = useRouter();
const authStore = useAuthStore();

const useRecoveryCode = ref(false);
const code = ref('');
const recoveryCode = ref('');
const codeInput = ref<InstanceType<typeof Input> | null>(null);
const recoveryInput = ref<InstanceType<typeof Input> | null>(null);

const canSubmit = computed(() => {
    if (authStore.isLoggingIn) return false;
    return useRecoveryCode.value
        ? recoveryCode.value.trim() !== ''
        : code.value.trim().length === 6;
});

onMounted(() => {
    if (!authStore.challengeToken) {
        router.replace({ name: 'login' });
    }
});

async function handleSubmit(): Promise<void> {
    if (!canSubmit.value) return;

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
    } else {
        (codeInput.value?.$el as HTMLInputElement)?.focus();
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
                <Label for="code">Authentication Code</Label>
                <div class="relative">
                    <ShieldCheckIcon
                        class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                    />
                    <Input
                        id="code"
                        ref="codeInput"
                        v-model="code"
                        type="text"
                        inputmode="numeric"
                        autocomplete="one-time-code"
                        placeholder="000000"
                        maxlength="6"
                        class="pl-9 tracking-widest text-center font-mono"
                        :disabled="authStore.isLoggingIn"
                        autofocus
                    />
                </div>
            </div>

            <div v-else class="grid gap-2">
                <Label for="recovery_code">Recovery Code</Label>
                <div class="relative">
                    <KeyIcon
                        class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                    />
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
                class="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
                {{ authStore.loginError }}
            </div>

            <div class="flex flex-col gap-3 pt-1">
                <Button type="submit" :disabled="!canSubmit" class="w-full">
                    <Loader2Icon v-if="authStore.isLoggingIn" class="animate-spin" />
                    <span v-if="authStore.isLoggingIn">Verifying...</span>
                    <span v-else>Verify</span>
                </Button>

                <Button type="button" variant="ghost" size="sm" class="text-muted-foreground" @click="toggleMode">
                    {{
                        useRecoveryCode
                            ? 'Use authentication code instead'
                            : 'Use a recovery code instead'
                    }}
                </Button>

                <Button
                    type="button"
                    variant="link"
                    class="text-muted-foreground"
                    @click="goBack"
                >
                    <ArrowLeftIcon class="size-3" />
                    Back to login
                </Button>
            </div>
        </form>
    </AuthLayout>
</template>
