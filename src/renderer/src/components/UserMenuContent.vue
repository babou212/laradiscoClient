<script setup lang="ts">
import { LogOut, Settings } from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import {
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import UserInfo from '@/components/UserInfo.vue';
import { useAuthStore } from '@/stores/auth';
import type { AuthUser } from '@/stores/auth';

type Props = {
    user: AuthUser;
};

defineProps<Props>();

const router = useRouter();
const authStore = useAuthStore();

const handleLogout = async () => {
    await authStore.logout();
    router.push({ name: 'login' });
};

const goToSettings = () => {
    router.push({ name: 'settings-profile' });
};
</script>

<template>
    <DropdownMenuLabel class="p-0 font-normal">
        <div class="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <UserInfo :user="user" :show-email="true" />
        </div>
    </DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuGroup>
        <DropdownMenuItem class="cursor-pointer" @click="goToSettings">
            <Settings class="mr-2 h-4 w-4" />
            Settings
        </DropdownMenuItem>
    </DropdownMenuGroup>
    <DropdownMenuSeparator />
    <DropdownMenuItem class="cursor-pointer" @click="handleLogout">
        <LogOut class="mr-2 h-4 w-4" />
        Log out
    </DropdownMenuItem>
</template>
