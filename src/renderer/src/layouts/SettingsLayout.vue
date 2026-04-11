<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

interface SettingsNavItem {
    title: string;
    routeName: string;
}

const sidebarNavItems: SettingsNavItem[] = [
    { title: 'Profile', routeName: 'settings-profile' },
    { title: 'Password', routeName: 'settings-password' },
    { title: 'Two-Factor Auth', routeName: 'settings-two-factor' },
    { title: 'Security', routeName: 'settings-security' },
    { title: 'Appearance', routeName: 'settings-appearance' },
    { title: 'Voice', routeName: 'settings-voice' },
    { title: 'Screen Share', routeName: 'settings-screen-share' },
    { title: 'Notifications', routeName: 'settings-notifications' },
    { title: 'About', routeName: 'settings-about' },
];

const permissions = computed(() => authStore.user?.permissions);

const adminNavItems = computed<SettingsNavItem[]>(() => {
    const items: SettingsNavItem[] = [];
    const perms = permissions.value;
    if (!perms) return items;

    if (perms.canInviteMembers || perms.isAdministrator) {
        items.push({ title: 'Invite Links', routeName: 'settings-invite-links' });
    }
    if (perms.canManageRoles || perms.isAdministrator) {
        items.push({ title: 'Roles', routeName: 'settings-roles' });
        items.push({ title: 'Members', routeName: 'settings-members' });
    }
    if (perms.canManageChannels || perms.isAdministrator) {
        items.push({ title: 'Channels', routeName: 'settings-channels' });
    }
    if (perms.canBanMembers || perms.canKickMembers || perms.isAdministrator) {
        items.push({ title: 'Moderation', routeName: 'settings-moderation' });
    }
    if (perms.canViewAuditLog || perms.isAdministrator) {
        items.push({ title: 'Audit Log', routeName: 'settings-audit-log' });
    }
    return items;
});

function isActive(routeName: string): boolean {
    return route.name === routeName;
}
</script>

<template>
    <div class="bg-background h-full overflow-y-auto">
        <div class="mx-auto max-w-7xl px-4 py-6 md:py-8">
            <div class="mb-6">
                <Button variant="ghost" size="sm" class="-ml-2" @click="router.push({ name: 'home' })">
                    <ArrowLeft class="mr-2 h-4 w-4" />
                    Back
                </Button>
            </div>

            <div class="mb-8">
                <h1 class="text-3xl font-bold tracking-tight">Settings</h1>
                <p class="text-muted-foreground mt-2">Manage your profile and account settings</p>
            </div>

            <div class="flex flex-col gap-8 lg:flex-row lg:gap-12">
                <aside class="w-full shrink-0 lg:w-56">
                    <div class="bg-card rounded-lg border p-1">
                        <nav class="flex flex-col space-y-0.5" aria-label="Settings">
                            <Button
                                v-for="item in sidebarNavItems"
                                :key="item.routeName"
                                variant="ghost"
                                :class="[
                                    'justify-start font-medium transition-colors',
                                    isActive(item.routeName)
                                        ? 'bg-muted text-foreground'
                                        : 'text-muted-foreground hover:text-foreground',
                                ]"
                                @click="router.push({ name: item.routeName })"
                            >
                                {{ item.title }}
                            </Button>
                        </nav>

                        <template v-if="adminNavItems.length > 0">
                            <Separator class="my-1" />
                            <p class="text-muted-foreground px-3 py-1.5 text-xs font-medium tracking-wider uppercase">
                                Server
                            </p>
                            <nav class="flex flex-col space-y-0.5" aria-label="Server Settings">
                                <Button
                                    v-for="item in adminNavItems"
                                    :key="item.routeName"
                                    variant="ghost"
                                    :class="[
                                        'justify-start font-medium transition-colors',
                                        isActive(item.routeName)
                                            ? 'bg-muted text-foreground'
                                            : 'text-muted-foreground hover:text-foreground',
                                    ]"
                                    @click="router.push({ name: item.routeName })"
                                >
                                    {{ item.title }}
                                </Button>
                            </nav>
                        </template>
                    </div>
                </aside>

                <div class="min-w-0 flex-1">
                    <div class="max-w-2xl space-y-6">
                        <router-view />
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
