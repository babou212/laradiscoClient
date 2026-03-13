<script setup lang="ts">
import { ChevronsUpDown, LayoutGrid } from 'lucide-vue-next';
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppLogo from '@/components/AppLogo.vue';
import UserInfo from '@/components/UserInfo.vue';
import UserMenuContent from '@/components/UserMenuContent.vue';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from '@/components/ui/sidebar';
import { useAuthStore } from '@/stores/auth';
import type { NavItem } from '@/types';

const authStore = useAuthStore();
const route = useRoute();
const { isMobile, state } = useSidebar();

const user = computed(() => authStore.user);

const mainNavItems: NavItem[] = [
    {
        title: 'Dashboard',
        href: '/',
        icon: LayoutGrid,
    },
];

function isActiveRoute(href: string): boolean {
    return route.path === href;
}
</script>

<template>
    <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
            <SidebarMenu>
                <SidebarMenuItem>
                    <SidebarMenuButton size="lg" as-child>
                        <router-link to="/">
                            <AppLogo />
                        </router-link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
            <SidebarGroup class="px-2 py-0">
                <SidebarGroupLabel>Platform</SidebarGroupLabel>
                <SidebarGroupContent>
                    <SidebarMenu>
                        <SidebarMenuItem v-for="item in mainNavItems" :key="item.title">
                            <SidebarMenuButton as-child :is-active="isActiveRoute(item.href)" :tooltip="item.title">
                                <router-link :to="item.href">
                                    <component :is="item.icon" />
                                    <span>{{ item.title }}</span>
                                </router-link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarGroupContent>
            </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
            <SidebarMenu v-if="user">
                <SidebarMenuItem>
                    <DropdownMenu>
                        <DropdownMenuTrigger as-child>
                            <SidebarMenuButton
                                size="lg"
                                class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                            >
                                <UserInfo :user="user" />
                                <ChevronsUpDown class="ml-auto size-4" />
                            </SidebarMenuButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            class="w-(--reka-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                            :side="isMobile ? 'bottom' : state === 'collapsed' ? 'left' : 'bottom'"
                            align="end"
                            :side-offset="4"
                        >
                            <UserMenuContent :user="user" />
                        </DropdownMenuContent>
                    </DropdownMenu>
                </SidebarMenuItem>
            </SidebarMenu>
        </SidebarFooter>
    </Sidebar>
    <slot />
</template>
