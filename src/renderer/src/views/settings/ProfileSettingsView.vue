<!-- ProfileSettingsView - User profile settings -->

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import InputError from '@/components/InputError.vue';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
} from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/auth';
import api from '@/lib/api';

const authStore = useAuthStore();
const router = useRouter();

const name = ref('');
const email = ref('');
const errors = ref<Record<string, string>>({});
const processing = ref(false);
const recentlySuccessful = ref(false);

const deletePassword = ref('');
const deleteErrors = ref<Record<string, string>>({});
const deleteProcessing = ref(false);
const showDeleteDialog = ref(false);

onMounted(() => {
    if (authStore.user) {
        name.value = authStore.user.name;
        email.value = authStore.user.email;
    }
});

async function updateProfile() {
    processing.value = true;
    errors.value = {};
    try {
        const response = await api.patch('/settings/profile', {
            name: name.value,
            email: email.value,
        });
        if (response.data) {
            authStore.user = { ...authStore.user!, ...response.data };
        }
        recentlySuccessful.value = true;
        setTimeout(() => (recentlySuccessful.value = false), 3000);
    } catch (err: any) {
        if (err.response?.status === 422) {
            const validationErrors = err.response.data.errors ?? {};
            for (const [key, val] of Object.entries(validationErrors)) {
                errors.value[key] = Array.isArray(val) ? val[0] : String(val);
            }
        }
    } finally {
        processing.value = false;
    }
}

async function deleteAccount() {
    deleteProcessing.value = true;
    deleteErrors.value = {};
    try {
        await api.delete('/settings/profile', { data: { password: deletePassword.value } });
        await authStore.logout();
        router.push({ name: 'login' });
    } catch (err: any) {
        if (err.response?.status === 422) {
            const validationErrors = err.response.data.errors ?? {};
            for (const [key, val] of Object.entries(validationErrors)) {
                deleteErrors.value[key] = Array.isArray(val) ? val[0] : String(val);
            }
        }
    } finally {
        deleteProcessing.value = false;
    }
}
</script>

<template>
    <div class="space-y-6">
        <!-- Profile Information Card -->
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">Profile information</h2>
                <p class="text-muted-foreground mt-1 text-sm">Update your name and email address</p>
            </div>

            <div class="p-6">
                <form @submit.prevent="updateProfile" class="space-y-5">
                    <div class="grid gap-2">
                        <Label for="name">Name</Label>
                        <Input
                            id="name"
                            v-model="name"
                            class="mt-1 block w-full"
                            required
                            autocomplete="name"
                            placeholder="Full name"
                        />
                        <InputError :message="errors.name" />
                    </div>

                    <div class="grid gap-2">
                        <Label for="email">Email address</Label>
                        <Input
                            id="email"
                            type="email"
                            v-model="email"
                            class="mt-1 block w-full"
                            required
                            autocomplete="username"
                            placeholder="Email address"
                        />
                        <InputError :message="errors.email" />
                    </div>

                    <div class="flex items-center gap-4 pt-2">
                        <Button :disabled="processing">Save changes</Button>

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

        <!-- Delete Account Card -->
        <div class="border-destructive/50 bg-card overflow-hidden rounded-lg border">
            <div class="border-destructive/50 bg-destructive/10 border-b px-6 py-4">
                <h2 class="text-destructive text-lg font-semibold">Danger zone</h2>
                <p class="text-destructive/80 mt-1 text-sm">Permanently delete your account and all of its data</p>
            </div>

            <div class="space-y-4 p-6">
                <div class="border-destructive/20 bg-destructive/10 rounded-md border p-4">
                    <div class="flex items-start gap-3">
                        <div class="mt-0.5 shrink-0">
                            <svg class="text-destructive h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                />
                            </svg>
                        </div>
                        <div class="space-y-1">
                            <p class="text-destructive text-sm font-medium">This action cannot be undone</p>
                            <p class="text-muted-foreground text-sm">
                                Once you delete your account, all of your data will be permanently removed.
                            </p>
                        </div>
                    </div>
                </div>

                <Dialog v-model:open="showDeleteDialog">
                    <DialogTrigger as-child>
                        <Button variant="destructive" class="w-full sm:w-auto"> Delete account </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <form @submit.prevent="deleteAccount" class="space-y-6">
                            <DialogHeader class="space-y-3">
                                <DialogTitle>Are you sure you want to delete your account?</DialogTitle>
                                <DialogDescription>
                                    Once your account is deleted, all of its resources and data will also be permanently
                                    deleted. Please enter your password to confirm.
                                </DialogDescription>
                            </DialogHeader>

                            <div class="grid gap-2">
                                <Label for="delete-password" class="sr-only">Password</Label>
                                <Input
                                    id="delete-password"
                                    type="password"
                                    v-model="deletePassword"
                                    placeholder="Password"
                                />
                                <InputError :message="deleteErrors.password" />
                            </div>

                            <DialogFooter class="gap-2">
                                <DialogClose as-child>
                                    <Button
                                        variant="secondary"
                                        @click="
                                            deletePassword = '';
                                            deleteErrors = {};
                                        "
                                    >
                                        Cancel
                                    </Button>
                                </DialogClose>
                                <Button type="submit" variant="destructive" :disabled="deleteProcessing">
                                    Delete account
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    </div>
</template>
