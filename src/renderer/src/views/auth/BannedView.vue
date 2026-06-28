<script setup lang="ts">
import { format } from 'date-fns';
import { ArrowLeftIcon, BanIcon } from 'lucide-vue-next';
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button } from '@/components/ui/button';
import { currentDateFnsLocale } from '@/i18n';
import AuthLayout from '@/layouts/AuthLayout.vue';
import { useAuthStore } from '@/stores/auth';
import { useServerStore } from '@/stores/server';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();
const serverStore = useServerStore();

const serverName = computed(() => serverStore.activeServer?.name ?? t('auth.serverFallback'));

const ban = computed(() => authStore.banInfo);
const reason = computed(() => ban.value?.reason?.trim() || null);
const isPermanent = computed(() => ban.value?.permanent !== false && !ban.value?.expires_at);

const expiresAt = computed(() => (ban.value?.expires_at ? new Date(ban.value.expires_at) : null));
const formattedExpiry = computed(() =>
    expiresAt.value ? format(expiresAt.value, 'PPpp', { locale: currentDateFnsLocale.value }) : '',
);

// Live countdown — re-evaluated each tick via the `now` ref.
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;

const isExpired = computed(() => !isPermanent.value && !!expiresAt.value && expiresAt.value.getTime() <= now.value);

const timeRemaining = computed(() => {
    if (isPermanent.value || !expiresAt.value) return '';
    let diff = Math.max(0, Math.floor((expiresAt.value.getTime() - now.value) / 1000));
    const days = Math.floor(diff / 86400);
    diff -= days * 86400;
    const hours = Math.floor(diff / 3600);
    diff -= hours * 3600;
    const minutes = Math.floor(diff / 60);
    const seconds = diff - minutes * 60;
    const parts: string[] = [];
    if (days) parts.push(`${days}d`);
    if (hours || days) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    return parts.join(' ');
});

onMounted(() => {
    timer = setInterval(() => {
        now.value = Date.now();
    }, 1000);
});

onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
});

function backToLogin(): void {
    authStore.clearBan();
    router.push({ name: 'login' });
}
</script>

<template>
    <AuthLayout :title="t('auth.banned.title')" :description="t('auth.banned.description', { server: serverName })">
        <div class="flex flex-col gap-5">
            <div
                class="bg-destructive/10 text-destructive flex items-center justify-center self-center rounded-full p-4"
            >
                <BanIcon class="size-8" />
            </div>

            <div class="border-destructive/40 bg-destructive/5 space-y-3 rounded-md border px-4 py-3 text-sm">
                <div>
                    <p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                        {{ t('auth.banned.reasonLabel') }}
                    </p>
                    <p class="mt-1">{{ reason ?? t('auth.banned.noReason') }}</p>
                </div>

                <div class="border-border/60 border-t pt-3">
                    <p v-if="isPermanent" class="font-medium">{{ t('auth.banned.permanent') }}</p>
                    <template v-else-if="isExpired">
                        <p class="text-foreground font-medium">{{ t('auth.banned.expired') }}</p>
                    </template>
                    <template v-else>
                        <p>{{ t('auth.banned.temporary', { date: formattedExpiry }) }}</p>
                        <p class="text-muted-foreground mt-1 font-mono text-xs">
                            {{ t('auth.banned.timeRemaining', { duration: timeRemaining }) }}
                        </p>
                    </template>
                </div>
            </div>

            <Button type="button" variant="outline" class="w-full" @click="backToLogin">
                <ArrowLeftIcon class="size-3" />
                {{ t('auth.banned.backToLogin') }}
            </Button>
        </div>
    </AuthLayout>
</template>
