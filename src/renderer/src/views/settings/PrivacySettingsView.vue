<!-- PrivacySettingsView - Activity / presence privacy preferences -->

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getProfile, updateProfile } from '@/api/settings';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { setActivityEnabled } from '@/composables/useActivityReporter';

const { t } = useI18n();

const showActivity = ref(true);
const original = ref(true);
const processing = ref(false);
const recentlySuccessful = ref(false);

onMounted(async () => {
    try {
        const profile = await getProfile();
        const value = profile.data.attributes.show_activity ?? true;
        showActivity.value = value;
        original.value = value;
    } catch (error) {
        console.error('Failed to load privacy settings', error);
    }
});

async function submit() {
    if (processing.value || showActivity.value === original.value) return;
    processing.value = true;
    try {
        await updateProfile({ show_activity: showActivity.value });
        // Start/stop local detection immediately to match the new preference.
        await setActivityEnabled(showActivity.value);
        original.value = showActivity.value;
        recentlySuccessful.value = true;
        setTimeout(() => (recentlySuccessful.value = false), 3000);
    } catch (error) {
        console.error('Failed to save privacy settings', error);
    } finally {
        processing.value = false;
    }
}
</script>

<template>
    <div>
        <div class="bg-card rounded-lg border">
            <div class="bg-muted/50 border-b px-6 py-4">
                <h2 class="text-lg font-semibold">{{ t('settings.privacy.title') }}</h2>
                <p class="text-muted-foreground mt-1 text-sm">{{ t('settings.privacy.description') }}</p>
            </div>

            <div class="p-6">
                <form class="space-y-6" @submit.prevent="submit">
                    <div class="flex items-start gap-3">
                        <Checkbox
                            id="show_activity"
                            :model-value="showActivity"
                            @update:model-value="showActivity = !!$event"
                        />
                        <div class="space-y-1">
                            <Label for="show_activity" class="cursor-pointer">
                                {{ t('settings.privacy.showActivityLabel') }}
                            </Label>
                            <p class="text-muted-foreground text-sm">
                                {{ t('settings.privacy.showActivityDescription') }}
                            </p>
                        </div>
                    </div>

                    <div class="flex items-center gap-4 border-t pt-6">
                        <Button type="submit" :disabled="processing || showActivity === original">
                            {{ t('settings.privacy.save') }}
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
                                {{ t('common.saveSuccess') }}
                            </p>
                        </Transition>
                    </div>
                </form>
            </div>
        </div>
    </div>
</template>
