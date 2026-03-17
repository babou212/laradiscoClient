<!-- PasswordSettingsView - Password change settings -->

<script setup lang="ts">
import { ref } from 'vue';
import InputError from '@/components/InputError.vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import api from '@/lib/api';

const currentPassword = ref('');
const password = ref('');
const passwordConfirmation = ref('');
const errors = ref<Record<string, string>>({});
const processing = ref(false);
const recentlySuccessful = ref(false);

async function updatePassword() {
    processing.value = true;
    errors.value = {};
    try {
        await api.put('/settings/password', {
            current_password: currentPassword.value,
            password: password.value,
            password_confirmation: passwordConfirmation.value,
        });
        currentPassword.value = '';
        password.value = '';
        passwordConfirmation.value = '';
        recentlySuccessful.value = true;
        setTimeout(() => (recentlySuccessful.value = false), 3000);
    } catch (err: any) {
        if (err.response?.status === 422) {
            const validationErrors = err.response.data.errors ?? {};
            for (const [key, val] of Object.entries(validationErrors)) {
                errors.value[key] = Array.isArray(val) ? val[0] : String(val);
            }
        }
        password.value = '';
        passwordConfirmation.value = '';
    } finally {
        processing.value = false;
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
                <form @submit.prevent="updatePassword" class="space-y-5">
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
