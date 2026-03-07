<!-- TwoFactorSettingsView - Two-factor authentication settings -->

<script setup lang="ts">
import DOMPurify from 'dompurify';
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { useClipboard } from '@vueuse/core';
import { Check, Copy, Eye, EyeOff, LockKeyhole, RefreshCw, ShieldBan, ShieldCheck } from 'lucide-vue-next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { isDarkTheme, useAppearance } from '@/composables/useAppearance';
import { useTwoFactorAuth } from '@/composables/useTwoFactorAuth';
import InputError from '@/components/InputError.vue';
import api from '@/lib/api';

const { theme } = useAppearance();
const {
    qrCodeSvg,
    manualSetupKey,
    recoveryCodesList,
    errors: twoFactorErrors,
    hasSetupData,
    clearTwoFactorAuthData,
    fetchSetupData,
    fetchRecoveryCodes,
} = useTwoFactorAuth();

const { copy, copied } = useClipboard();

const sanitizedQrCodeSvg = computed(() => {
    if (!qrCodeSvg.value) return null;
    return DOMPurify.sanitize(qrCodeSvg.value, {
        USE_PROFILES: { svg: true },
        ADD_TAGS: ['svg', 'path', 'rect', 'circle', 'g', 'defs', 'use'],
        FORBID_TAGS: ['script', 'foreignObject', 'animate', 'set'],
        FORBID_ATTR: ['onload', 'onerror', 'onclick', 'onmouseover'],
    });
});

const twoFactorEnabled = ref(false);
const isLoading = ref(true);
const showSetupModal = ref(false);
const showVerificationStep = ref(false);
const code = ref('');
const codeError = ref('');
const processing = ref(false);
const isRecoveryCodesVisible = ref(false);

onMounted(async () => {
    try {
        const response = await api.get('/settings/two-factor');
        twoFactorEnabled.value = response.data.twoFactorEnabled;
    } catch {
        // handle
    } finally {
        isLoading.value = false;
    }
});

onUnmounted(() => {
    clearTwoFactorAuthData();
});

async function enableTwoFactor() {
    processing.value = true;
    try {
        await api.post('/settings/two-factor/enable');
        await fetchSetupData();
        showSetupModal.value = true;
    } catch {
        // handle
    } finally {
        processing.value = false;
    }
}

async function disableTwoFactor() {
    processing.value = true;
    try {
        await api.delete('/settings/two-factor/disable');
        twoFactorEnabled.value = false;
        clearTwoFactorAuthData();
    } catch {
        // handle
    } finally {
        processing.value = false;
    }
}

async function confirmTwoFactor() {
    processing.value = true;
    codeError.value = '';
    try {
        await api.post('/settings/two-factor/confirm', { code: code.value });
        twoFactorEnabled.value = true;
        showSetupModal.value = false;
        showVerificationStep.value = false;
        code.value = '';
        clearTwoFactorAuthData();
    } catch (err: any) {
        codeError.value = err.response?.data?.error ?? 'Invalid code';
        code.value = '';
    } finally {
        processing.value = false;
    }
}

function handleContinue() {
    showVerificationStep.value = true;
}

function resetModal() {
    showVerificationStep.value = false;
    code.value = '';
    codeError.value = '';
}

async function toggleRecoveryCodes() {
    if (!isRecoveryCodesVisible.value && !recoveryCodesList.value.length) {
        await fetchRecoveryCodes();
    }
    isRecoveryCodesVisible.value = !isRecoveryCodesVisible.value;
}

async function regenerateRecoveryCodes() {
    processing.value = true;
    try {
        const response = await api.post('/settings/two-factor/recovery-codes');
        recoveryCodesList.value = response.data.recovery_codes ?? response.data ?? [];
    } catch {
        // handle
    } finally {
        processing.value = false;
    }
}
</script>

<template>
    <div class="space-y-6">
        <div class="rounded-lg border bg-card">
            <div class="border-b bg-muted/50 px-6 py-4">
                <h2 class="text-lg font-semibold">Two-Factor Authentication</h2>
                <p class="mt-1 text-sm text-muted-foreground">
                    Add an additional layer of security to your account
                </p>
            </div>

            <div class="p-6">
                <div v-if="isLoading" class="text-sm text-muted-foreground">Loading...</div>

                <div v-else-if="!twoFactorEnabled" class="space-y-5">
                    <Badge variant="destructive">Disabled</Badge>

                    <p class="text-muted-foreground">
                        When you enable two-factor authentication, you will be prompted for a secure pin during login. This pin can be retrieved from a TOTP-supported application on your phone.
                    </p>

                    <div>
                        <Button
                            v-if="hasSetupData"
                            @click="showSetupModal = true"
                        >
                            <ShieldCheck class="mr-2 h-4 w-4" />Continue Setup
                        </Button>
                        <Button
                            v-else
                            @click="enableTwoFactor"
                            :disabled="processing"
                        >
                            <ShieldCheck class="mr-2 h-4 w-4" />Enable 2FA
                        </Button>
                    </div>
                </div>

                <div v-else class="space-y-5">
                    <Badge variant="default">Enabled</Badge>

                    <p class="text-muted-foreground">
                        With two-factor authentication enabled, you will be prompted for a secure, random pin during login, which you can retrieve from the TOTP-supported application on your phone.
                    </p>

                    <div class="rounded-lg border p-4">
                        <div class="flex items-center gap-3 mb-2">
                            <LockKeyhole class="h-4 w-4" />
                            <h3 class="text-sm font-semibold">2FA Recovery Codes</h3>
                        </div>
                        <p class="text-sm text-muted-foreground mb-3">
                            Recovery codes let you regain access if you lose your 2FA device. Store them in a secure password manager.
                        </p>

                        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <Button @click="toggleRecoveryCodes" class="w-fit">
                                <component :is="isRecoveryCodesVisible ? EyeOff : Eye" class="mr-2 h-4 w-4" />
                                {{ isRecoveryCodesVisible ? 'Hide' : 'View' }} Recovery Codes
                            </Button>

                            <Button
                                v-if="isRecoveryCodesVisible && recoveryCodesList.length"
                                variant="secondary"
                                @click="regenerateRecoveryCodes"
                                :disabled="processing"
                            >
                                <RefreshCw class="mr-2 h-4 w-4" /> Regenerate Codes
                            </Button>
                        </div>

                        <div
                            :class="[
                                'relative overflow-hidden transition-all duration-300',
                                isRecoveryCodesVisible ? 'h-auto opacity-100' : 'h-0 opacity-0',
                            ]"
                        >
                            <div v-if="twoFactorErrors?.length" class="mt-3 text-sm text-destructive">
                                <p v-for="(error, i) in twoFactorErrors" :key="i">{{ error }}</p>
                            </div>
                            <div v-else class="mt-3 space-y-3">
                                <div class="grid gap-1 rounded-lg bg-muted p-4 font-mono text-sm">
                                    <div v-if="!recoveryCodesList.length" class="space-y-2">
                                        <div v-for="n in 8" :key="n" class="h-4 animate-pulse rounded bg-muted-foreground/20" />
                                    </div>
                                    <div v-else v-for="(rc, index) in recoveryCodesList" :key="index">
                                        {{ rc }}
                                    </div>
                                </div>
                                <p class="text-xs text-muted-foreground">
                                    Each recovery code can be used once. If you need more, click <span class="font-bold">Regenerate Codes</span> above.
                                </p>
                            </div>
                        </div>
                    </div>

                    <Button variant="destructive" @click="disableTwoFactor" :disabled="processing">
                        <ShieldBan class="mr-2 h-4 w-4" />
                        Disable 2FA
                    </Button>
                </div>
            </div>
        </div>

        <Dialog :open="showSetupModal" @update:open="(v) => { showSetupModal = v; if (!v) resetModal(); }">
            <DialogContent class="sm:max-w-md">
                <DialogHeader class="flex items-center justify-center">
                    <DialogTitle>
                        {{ showVerificationStep ? 'Verify Authentication Code' : 'Enable Two-Factor Authentication' }}
                    </DialogTitle>
                    <DialogDescription class="text-center">
                        {{ showVerificationStep
                            ? 'Enter the 6-digit code from your authenticator app'
                            : 'Scan the QR code or enter the setup key in your authenticator app'
                        }}
                    </DialogDescription>
                </DialogHeader>

                <div class="relative flex w-auto flex-col items-center justify-center space-y-5">
                    <template v-if="!showVerificationStep">
                        <div v-if="twoFactorErrors?.length" class="text-sm text-destructive">
                            <p v-for="(error, i) in twoFactorErrors" :key="i">{{ error }}</p>
                        </div>
                        <template v-else>
                            <div class="relative mx-auto flex max-w-md items-center overflow-hidden">
                                <div class="relative mx-auto aspect-square w-64 overflow-hidden rounded-lg border border-border">
                                    <div v-if="!qrCodeSvg" class="absolute inset-0 z-10 flex aspect-square h-auto w-full animate-pulse items-center justify-center bg-background">
                                        <Spinner class="size-6" />
                                    </div>
                                    <div v-else class="relative z-10 overflow-hidden border p-5">
                                        <div v-html="sanitizedQrCodeSvg" class="flex aspect-square size-full items-center justify-center" :style="{ filter: isDarkTheme(theme) ? 'invert(1) brightness(1.5)' : undefined }" />
                                    </div>
                                </div>
                            </div>

                            <div class="flex w-full items-center space-x-5">
                                <Button class="w-full" @click="handleContinue">Continue</Button>
                            </div>

                            <div class="relative flex w-full items-center justify-center">
                                <div class="absolute inset-0 top-1/2 h-px w-full bg-border" />
                                <span class="relative bg-background px-2 py-1 text-sm text-muted-foreground">or, enter the code manually</span>
                            </div>

                            <div class="flex w-full items-center justify-center space-x-2">
                                <div class="flex w-full items-stretch overflow-hidden rounded-xl border border-border">
                                    <div v-if="!manualSetupKey" class="flex h-full w-full items-center justify-center bg-muted p-3">
                                        <Spinner />
                                    </div>
                                    <template v-else>
                                        <input type="text" readonly :value="manualSetupKey" class="h-full w-full bg-background p-3 text-foreground text-sm" />
                                        <button @click="copy(manualSetupKey || '')" class="relative block h-auto border-l border-border px-3 hover:bg-muted">
                                            <Check v-if="copied" class="w-4 text-green-500" />
                                            <Copy v-else class="w-4" />
                                        </button>
                                    </template>
                                </div>
                            </div>
                        </template>
                    </template>

                    <template v-else>
                        <form @submit.prevent="confirmTwoFactor" class="w-full space-y-4">
                            <div class="flex w-full flex-col items-center justify-center space-y-3 py-2">
                                <Input
                                    v-model="code"
                                    placeholder="Enter 6-digit code"
                                    class="text-center text-lg tracking-widest"
                                    maxlength="6"
                                    :disabled="processing"
                                />
                                <InputError :message="codeError" />
                            </div>

                            <div class="flex w-full items-center space-x-3">
                                <Button type="button" variant="outline" class="flex-1" @click="showVerificationStep = false" :disabled="processing">
                                    Back
                                </Button>
                                <Button type="submit" class="flex-1" :disabled="processing || code.length < 6">
                                    Confirm
                                </Button>
                            </div>
                        </form>
                    </template>
                </div>
            </DialogContent>
        </Dialog>
    </div>
</template>
