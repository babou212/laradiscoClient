<!-- TwoFactorSettingsView - Two-factor authentication settings -->

<script setup lang="ts">
import { useClipboard } from '@vueuse/core';
import DOMPurify from 'dompurify';
import { Check, Copy, Eye, EyeOff, LockKeyhole, RefreshCw, ShieldBan, ShieldCheck } from 'lucide-vue-next';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    getTwoFactorStatus,
    enableTwoFactor as apiEnableTwoFactor,
    disableTwoFactor as apiDisableTwoFactor,
    confirmTwoFactor as apiConfirmTwoFactor,
    regenerateRecoveryCodes as apiRegenerateRecoveryCodes,
} from '@/api/two-factor';
import InputError from '@/components/InputError.vue';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InputOtp } from '@/components/ui/input-otp';
import { Spinner } from '@/components/ui/spinner';
import { isDarkTheme, useAppearance } from '@/composables/useAppearance';
import { useTwoFactorAuth } from '@/composables/useTwoFactorAuth';

const { t } = useI18n();
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
        const status = await getTwoFactorStatus();
        twoFactorEnabled.value = status.twoFactorEnabled;
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
        await apiEnableTwoFactor();
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
        await apiDisableTwoFactor();
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
        await apiConfirmTwoFactor(code.value);
        twoFactorEnabled.value = true;
        showSetupModal.value = false;
        showVerificationStep.value = false;
        code.value = '';
        clearTwoFactorAuthData();
    } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { error?: string } } };
        codeError.value = axiosErr.response?.data?.error ?? t('settings.twoFactor.setup.invalidCode');
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
        recoveryCodesList.value = await apiRegenerateRecoveryCodes();
    } catch {
        // handle
    } finally {
        processing.value = false;
    }
}
</script>

<template>
    <div class="space-y-6">
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">{{ t('settings.twoFactor.title') }}</h2>
                <p class="text-muted-foreground mt-1 text-sm">{{ t('settings.twoFactor.description') }}</p>
            </div>

            <div class="p-6">
                <div v-if="isLoading" class="text-muted-foreground text-sm">{{ t('settings.common.loading') }}</div>

                <div v-else-if="!twoFactorEnabled" class="space-y-5">
                    <Badge variant="destructive">{{ t('settings.twoFactor.disabledBadge') }}</Badge>

                    <p class="text-muted-foreground">
                        {{ t('settings.twoFactor.disabledBody') }}
                    </p>

                    <div>
                        <Button v-if="hasSetupData" @click="showSetupModal = true">
                            <ShieldCheck class="mr-2 h-4 w-4" />{{ t('settings.twoFactor.continueSetup') }}
                        </Button>
                        <Button v-else @click="enableTwoFactor" :disabled="processing">
                            <ShieldCheck class="mr-2 h-4 w-4" />{{ t('settings.twoFactor.enable') }}
                        </Button>
                    </div>
                </div>

                <div v-else class="space-y-5">
                    <Badge variant="default">{{ t('settings.twoFactor.enabledBadge') }}</Badge>

                    <p class="text-muted-foreground">
                        {{ t('settings.twoFactor.enabledBody') }}
                    </p>

                    <div class="rounded-lg border p-4">
                        <div class="mb-2 flex items-center gap-3">
                            <LockKeyhole class="h-4 w-4" />
                            <h3 class="text-sm font-semibold">{{ t('settings.twoFactor.recovery.title') }}</h3>
                        </div>
                        <p class="text-muted-foreground mb-3 text-sm">
                            {{ t('settings.twoFactor.recovery.description') }}
                        </p>

                        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <Button @click="toggleRecoveryCodes" class="w-fit">
                                <component :is="isRecoveryCodesVisible ? EyeOff : Eye" class="mr-2 h-4 w-4" />
                                {{
                                    isRecoveryCodesVisible
                                        ? t('settings.twoFactor.recovery.hide')
                                        : t('settings.twoFactor.recovery.view')
                                }}
                            </Button>

                            <Button
                                v-if="isRecoveryCodesVisible && recoveryCodesList.length"
                                variant="secondary"
                                @click="regenerateRecoveryCodes"
                                :disabled="processing"
                            >
                                <RefreshCw class="mr-2 h-4 w-4" /> {{ t('settings.twoFactor.recovery.regenerate') }}
                            </Button>
                        </div>

                        <div
                            :class="[
                                'relative overflow-hidden transition-all duration-300',
                                isRecoveryCodesVisible ? 'h-auto opacity-100' : 'h-0 opacity-0',
                            ]"
                        >
                            <div v-if="twoFactorErrors?.length" class="text-destructive mt-3 text-sm">
                                <p v-for="(error, i) in twoFactorErrors" :key="i">{{ error }}</p>
                            </div>
                            <div v-else class="mt-3 space-y-3">
                                <div class="bg-muted grid gap-1 rounded-lg p-4 font-mono text-sm">
                                    <div v-if="!recoveryCodesList.length" class="space-y-2">
                                        <div
                                            v-for="n in 8"
                                            :key="n"
                                            class="bg-muted-foreground/20 h-4 animate-pulse rounded"
                                        />
                                    </div>
                                    <div v-else v-for="(rc, index) in recoveryCodesList" :key="index">
                                        {{ rc }}
                                    </div>
                                </div>
                                <p class="text-muted-foreground text-xs">
                                    {{ t('settings.twoFactor.recovery.hintPrefix') }}
                                    <span class="font-bold">{{ t('settings.twoFactor.recovery.hintRegen') }}</span>
                                    {{ t('settings.twoFactor.recovery.hintSuffix') }}
                                </p>
                            </div>
                        </div>
                    </div>

                    <Button variant="destructive" @click="disableTwoFactor" :disabled="processing">
                        <ShieldBan class="mr-2 h-4 w-4" />
                        {{ t('settings.twoFactor.disable') }}
                    </Button>
                </div>
            </div>
        </div>

        <Dialog
            :open="showSetupModal"
            @update:open="
                (v) => {
                    showSetupModal = v;
                    if (!v) resetModal();
                }
            "
        >
            <DialogContent class="sm:max-w-md">
                <DialogHeader class="flex items-center justify-center">
                    <DialogTitle>
                        {{
                            showVerificationStep
                                ? t('settings.twoFactor.setup.verifyTitle')
                                : t('settings.twoFactor.setup.scanTitle')
                        }}
                    </DialogTitle>
                    <DialogDescription class="text-center">
                        {{
                            showVerificationStep
                                ? t('settings.twoFactor.setup.verifyDescription')
                                : t('settings.twoFactor.setup.scanDescription')
                        }}
                    </DialogDescription>
                </DialogHeader>

                <div class="relative flex w-auto flex-col items-center justify-center space-y-5">
                    <template v-if="!showVerificationStep">
                        <div v-if="twoFactorErrors?.length" class="text-destructive text-sm">
                            <p v-for="(error, i) in twoFactorErrors" :key="i">{{ error }}</p>
                        </div>
                        <template v-else>
                            <div class="relative mx-auto flex max-w-md items-center overflow-hidden">
                                <div
                                    class="border-border relative mx-auto aspect-square w-64 overflow-hidden rounded-lg border"
                                >
                                    <div
                                        v-if="!qrCodeSvg"
                                        class="bg-background absolute inset-0 z-10 flex aspect-square h-auto w-full animate-pulse items-center justify-center"
                                    >
                                        <Spinner class="size-6" />
                                    </div>
                                    <div v-else class="relative z-10 overflow-hidden border p-5">
                                        <div
                                            v-html="sanitizedQrCodeSvg"
                                            class="flex aspect-square size-full items-center justify-center"
                                            :style="{
                                                filter: isDarkTheme(theme) ? 'invert(1) brightness(1.5)' : undefined,
                                            }"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div class="flex w-full items-center space-x-5">
                                <Button class="w-full" @click="handleContinue">
                                    {{ t('settings.twoFactor.setup.continue') }}
                                </Button>
                            </div>

                            <div class="relative flex w-full items-center justify-center">
                                <div class="bg-border absolute inset-0 top-1/2 h-px w-full" />
                                <span class="bg-background text-muted-foreground relative px-2 py-1 text-sm">
                                    {{ t('settings.twoFactor.setup.orManual') }}
                                </span>
                            </div>

                            <div class="flex w-full items-center justify-center space-x-2">
                                <div class="border-border flex w-full items-stretch overflow-hidden rounded-xl border">
                                    <div
                                        v-if="!manualSetupKey"
                                        class="bg-muted flex h-full w-full items-center justify-center p-3"
                                    >
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
                                            @click="copy(manualSetupKey || '')"
                                            class="border-border hover:bg-muted relative block h-auto border-l px-3"
                                        >
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
                                <InputOtp
                                    v-model="code"
                                    :maxlength="6"
                                    :disabled="processing"
                                    @complete="confirmTwoFactor"
                                />
                                <InputError :message="codeError" />
                            </div>

                            <div class="flex w-full items-center space-x-3">
                                <Button
                                    type="button"
                                    variant="outline"
                                    class="flex-1"
                                    @click="showVerificationStep = false"
                                    :disabled="processing"
                                >
                                    {{ t('settings.twoFactor.setup.back') }}
                                </Button>
                                <Button type="submit" class="flex-1" :disabled="processing || code.length < 6">
                                    {{ t('settings.twoFactor.setup.confirm') }}
                                </Button>
                            </div>
                        </form>
                    </template>
                </div>
            </DialogContent>
        </Dialog>
    </div>
</template>
