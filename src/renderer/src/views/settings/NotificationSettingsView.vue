<!-- NotificationSettingsView - Notification preferences -->

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useNotificationsStore } from '@/stores/notifications';

const enableToastNotifications = ref(true);
const enableBrowserNotifications = ref(true);
const enableDmNotifications = ref(true);
const enableMentionNotifications = ref(true);

const notificationsStore = useNotificationsStore();

const originalValues = ref({
    toast: true,
    browser: true,
    dm: true,
    mention: true,
});

const processing = ref(false);
const recentlySuccessful = ref(false);

const isDirty = computed(() => {
    return (
        enableToastNotifications.value !== originalValues.value.toast ||
        enableBrowserNotifications.value !== originalValues.value.browser ||
        enableDmNotifications.value !== originalValues.value.dm ||
        enableMentionNotifications.value !== originalValues.value.mention
    );
});

onMounted(() => {
    const prefs = notificationsStore.preferences;
    enableToastNotifications.value = prefs.enable_toast_notifications;
    enableBrowserNotifications.value = prefs.enable_browser_notifications;
    enableDmNotifications.value = prefs.enable_dm_notifications;
    enableMentionNotifications.value = prefs.enable_mention_notifications;
    originalValues.value = {
        toast: prefs.enable_toast_notifications,
        browser: prefs.enable_browser_notifications,
        dm: prefs.enable_dm_notifications,
        mention: prefs.enable_mention_notifications,
    };
});

function submit() {
    processing.value = true;
    const newPrefs = {
        enable_toast_notifications: enableToastNotifications.value,
        enable_browser_notifications: enableBrowserNotifications.value,
        enable_dm_notifications: enableDmNotifications.value,
        enable_mention_notifications: enableMentionNotifications.value,
    };
    notificationsStore.updatePreferences(newPrefs);
    originalValues.value = {
        toast: enableToastNotifications.value,
        browser: enableBrowserNotifications.value,
        dm: enableDmNotifications.value,
        mention: enableMentionNotifications.value,
    };
    recentlySuccessful.value = true;
    setTimeout(() => (recentlySuccessful.value = false), 3000);
    processing.value = false;
}
</script>

<template>
    <div>
        <div class="rounded-lg border bg-card">
            <div class="border-b bg-muted/50 px-6 py-4">
                <h2 class="text-lg font-semibold">Notifications</h2>
                <p class="mt-1 text-sm text-muted-foreground">
                    Control how and when you receive notifications
                </p>
            </div>

            <div class="p-6">
                <form class="space-y-6" @submit.prevent="submit">
                    <div class="space-y-4">
                        <h3 class="text-sm font-medium">Notification Types</h3>

                        <div class="flex items-start gap-3">
                            <Checkbox
                                id="enable_mention_notifications"
                                :model-value="enableMentionNotifications"
                                @update:model-value="enableMentionNotifications = !!$event"
                            />
                            <div class="space-y-1">
                                <Label for="enable_mention_notifications" class="cursor-pointer">
                                    Mention notifications
                                </Label>
                                <p class="text-sm text-muted-foreground">
                                    Get notified when someone mentions you with @username, @everyone, or @here
                                </p>
                            </div>
                        </div>

                        <div class="flex items-start gap-3">
                            <Checkbox
                                id="enable_dm_notifications"
                                :model-value="enableDmNotifications"
                                @update:model-value="enableDmNotifications = !!$event"
                            />
                            <div class="space-y-1">
                                <Label for="enable_dm_notifications" class="cursor-pointer">
                                    Direct message notifications
                                </Label>
                                <p class="text-sm text-muted-foreground">
                                    Get notified when someone sends you a direct message
                                </p>
                            </div>
                        </div>
                    </div>

                    <div class="border-t pt-6">
                        <div class="space-y-4">
                            <h3 class="text-sm font-medium">Delivery Methods</h3>

                            <div class="flex items-start gap-3">
                                <Checkbox
                                    id="enable_toast_notifications"
                                    :model-value="enableToastNotifications"
                                    @update:model-value="enableToastNotifications = !!$event"
                                />
                                <div class="space-y-1">
                                    <Label for="enable_toast_notifications" class="cursor-pointer">
                                        In-app pop-ups
                                    </Label>
                                    <p class="text-sm text-muted-foreground">
                                        Show toast notifications in the corner of the screen
                                    </p>
                                </div>
                            </div>

                            <div class="flex items-start gap-3">
                                <Checkbox
                                    id="enable_browser_notifications"
                                    :model-value="enableBrowserNotifications"
                                    @update:model-value="enableBrowserNotifications = !!$event"
                                />
                                <div class="space-y-1">
                                    <Label for="enable_browser_notifications" class="cursor-pointer">
                                        Desktop notifications
                                    </Label>
                                    <p class="text-sm text-muted-foreground">
                                        Show desktop notifications when the app is in the background
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="flex items-center gap-4 border-t pt-6">
                        <Button type="submit" :disabled="processing || !isDirty">
                            Save preferences
                        </Button>

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
