<!-- PasswordSettingsView - Password change settings -->

<script setup lang="ts">
import { ref } from 'vue';
import InputError from '@/components/InputError.vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMutation } from '@pinia/colada';
import { updatePassword } from '@/api/settings';
import { extractValidationErrors } from '@/api/errors';

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
                <h2 class="text-lg font-semibold">Update password</h2>
                <p class="text-muted-foreground mt-1 text-sm">
                    Ensure your account is using a long, random password to stay secure
                </p>
            </div>

            <div class="p-6">
                <form @submit.prevent="handleUpdatePassword" class="space-y-5">
                    <div class="grid gap-2">
                        <Label for="current_password">Current password</Label>
                        <Input
                            id="current_password"
                            v-model="currentPassword"
                            type="password"
                            class="mt-1 block w-full"
                            autocomplete="current-password"
                            placeholder="Current password"
                        />
                        <InputError :message="errors.current_password" />
                    </div>

                    <div class="grid gap-2">
                        <Label for="password">New password</Label>
                        <Input
                            id="password"
                            v-model="password"
                            type="password"
                            class="mt-1 block w-full"
                            autocomplete="new-password"
                            placeholder="New password"
                        />
                        <InputError :message="errors.password" />
                    </div>

                    <div class="grid gap-2">
                        <Label for="password_confirmation">Confirm password</Label>
                        <Input
                            id="password_confirmation"
                            v-model="passwordConfirmation"
                            type="password"
                            class="mt-1 block w-full"
                            autocomplete="new-password"
                            placeholder="Confirm password"
                        />
                        <InputError :message="errors.password_confirmation" />
                    </div>

                    <div class="flex items-center gap-4 pt-2">
                        <Button :disabled="processing">Save password</Button>

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
                                Saved successfully
                            </p>
                        </Transition>
                    </div>
                </form>
            </div>
        </div>
    </div>
</template>
