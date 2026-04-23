<!-- PasswordSettingsView - Password change settings -->

<script setup lang="ts">
import { useMutation } from '@pinia/colada';
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { extractValidationErrors } from '@/api/errors';
import { updatePassword } from '@/api/settings';
import InputError from '@/components/InputError.vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const { t } = useI18n();

const currentPassword = ref('');
const password = ref('');
const passwordConfirmation = ref('');
const errors = ref<Record<string, string>>({});
const recentlySuccessful = ref(false);

const { mutateAsync: doUpdatePassword, isLoading: processing } = useMutation({
    mutation: (data: { current_password: string; password: string; password_confirmation: string }) =>
        updatePassword(data),
});

async function handleUpdatePassword() {
    errors.value = {};
    try {
        await doUpdatePassword({
            current_password: currentPassword.value,
            password: password.value,
            password_confirmation: passwordConfirmation.value,
        });
        currentPassword.value = '';
        password.value = '';
        passwordConfirmation.value = '';
        recentlySuccessful.value = true;
        setTimeout(() => (recentlySuccessful.value = false), 3000);
    } catch (err: unknown) {
        errors.value = extractValidationErrors(err);
        password.value = '';
        passwordConfirmation.value = '';
    }
}
</script>

<template>
    <div>
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">{{ t('settings.password.title') }}</h2>
                <p class="text-muted-foreground mt-1 text-sm">
                    {{ t('settings.password.description') }}
                </p>
            </div>

            <div class="p-6">
                <form @submit.prevent="handleUpdatePassword" class="space-y-5">
                    <div class="grid gap-2">
                        <Label for="current_password">{{ t('settings.password.currentPassword') }}</Label>
                        <Input
                            id="current_password"
                            v-model="currentPassword"
                            type="password"
                            class="mt-1 block w-full"
                            autocomplete="current-password"
                            :placeholder="t('settings.password.currentPlaceholder')"
                        />
                        <InputError :message="errors.current_password" />
                    </div>

                    <div class="grid gap-2">
                        <Label for="password">{{ t('settings.password.newPassword') }}</Label>
                        <Input
                            id="password"
                            v-model="password"
                            type="password"
                            class="mt-1 block w-full"
                            autocomplete="new-password"
                            :placeholder="t('settings.password.newPlaceholder')"
                        />
                        <InputError :message="errors.password" />
                    </div>

                    <div class="grid gap-2">
                        <Label for="password_confirmation">{{ t('settings.password.confirmPassword') }}</Label>
                        <Input
                            id="password_confirmation"
                            v-model="passwordConfirmation"
                            type="password"
                            class="mt-1 block w-full"
                            autocomplete="new-password"
                            :placeholder="t('settings.password.confirmPlaceholder')"
                        />
                        <InputError :message="errors.password_confirmation" />
                    </div>

                    <div class="flex items-center gap-4 pt-2">
                        <Button :disabled="processing">{{ t('settings.password.save') }}</Button>

                        <Transition
                            enter-active-class="transition ease-in-out"
                            enter-from-class="opacity-0"
                            leave-active-class="transition ease-in-out"
                            leave-to-class="opacity-0"
                        >
                            <p
                                v-show="recentlySuccessful"
                                class="text-sm font-medium text-green-600 dark:text-green-500"
                            >
                                {{ t('common.saveSuccess') }}
                            </p>
                        </Transition>
                    </div>
                </form>
            </div>
        </div>
    </div>
</template>
