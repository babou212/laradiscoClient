import * as Sentry from '@sentry/electron/renderer';
import { acceptHMRUpdate, defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import { useServerStore } from './server';
import { useUsersStore } from './users';
import type { AvatarUrls } from '@/types/chat';

export interface AuthPermissions {
    canInviteMembers: boolean;
    canManageRoles: boolean;
    canManageChannels: boolean;
    canManageServer: boolean;
    canManageMessages: boolean;
    canBanMembers: boolean;
    canKickMembers: boolean;
    canViewAuditLog: boolean;
    isAdministrator: boolean;
    isBanned: boolean;
    isJailed: boolean;
}

export interface AuthUser {
    id: string;
    name: string;
    username: string;
    email: string;
    avatar_urls: AvatarUrls | null;
    permissions?: AuthPermissions;
}

export const useAuthStore = defineStore('auth', () => {
    const user = ref<AuthUser | null>(null);
    const token = ref<string | null>(null);
    const isLoggingIn = ref(false);
    const loginError = ref<string | null>(null);
    const challengeToken = ref<string | null>(null);

    const isAuthenticated = computed(() => !!user.value && !!token.value);

    function getValidServer(): { host: string; id: number } | null {
        const serverStore = useServerStore();
        const server = serverStore.activeServer;
        if (!server?.host || server.id == null) return null;
        return { host: server.host, id: server.id };
    }

    watch(
        user,
        (newUser) => {
            if (!newUser) return;
            const usersStore = useUsersStore();
            usersStore.upsert({
                id: newUser.id,
                username: newUser.username,
                display_name: newUser.name || newUser.username,
                name: newUser.name ?? null,
                avatar_urls: newUser.avatar_urls,
                permissions: newUser.permissions ?? null,
            });
        },
        { deep: true },
    );

    async function restoreSession(): Promise<boolean> {
        const server = getValidServer();
        if (!server) return false;

        const session = await window.api.auth.getSession(server.id);
        if (!session) return false;

        const result = await window.api.auth.validate(server.host, session.token);
        if (result.valid && result.user) {
            user.value = result.user;
            token.value = session.token;
            Sentry.setUser({ id: result.user.id, username: result.user.username });
            return true;
        }

        await window.api.auth.logout(server.host, server.id);
        return false;
    }

    async function login(email: string, password: string): Promise<boolean | 'two-factor'> {
        const server = getValidServer();
        if (!server) {
            loginError.value = 'No server connection';
            return false;
        }

        isLoggingIn.value = true;
        loginError.value = null;

        try {
            const result = await window.api.auth.login(server.host, server.id, email, password);

            if (result.twoFactor && result.challengeToken) {
                challengeToken.value = result.challengeToken;
                return 'two-factor';
            }

            if (result.success && result.user && result.token) {
                user.value = result.user;
                token.value = result.token;
                Sentry.setUser({ id: result.user.id, username: result.user.username });
                return true;
            }

            loginError.value = result.error ?? 'Login failed';
            return false;
        } catch {
            loginError.value = 'Unexpected error during login';
            return false;
        } finally {
            isLoggingIn.value = false;
        }
    }

    async function verifyTwoFactor(code: string | null, recoveryCode: string | null): Promise<boolean> {
        const server = getValidServer();
        if (!server || !challengeToken.value) {
            loginError.value = 'No active challenge. Please log in again.';
            return false;
        }

        isLoggingIn.value = true;
        loginError.value = null;

        try {
            const result = await window.api.auth.twoFactorChallenge(
                server.host,
                server.id,
                challengeToken.value,
                code,
                recoveryCode,
            );

            if (result.success && result.user && result.token) {
                user.value = result.user;
                token.value = result.token;
                challengeToken.value = null;
                Sentry.setUser({ id: result.user.id, username: result.user.username });
                return true;
            }

            loginError.value = result.error ?? 'Verification failed';
            return false;
        } catch {
            loginError.value = 'Unexpected error during verification';
            return false;
        } finally {
            isLoggingIn.value = false;
        }
    }

    async function register(
        inviteToken: string,
        name: string,
        username: string,
        email: string,
        password: string,
        passwordConfirmation: string,
    ): Promise<boolean> {
        const server = getValidServer();
        if (!server) {
            loginError.value = 'No server connection';
            return false;
        }

        isLoggingIn.value = true;
        loginError.value = null;

        try {
            const result = await window.api.auth.register(
                server.host,
                server.id,
                inviteToken,
                name,
                username,
                email,
                password,
                passwordConfirmation,
            );

            if (result.success && result.user && result.token) {
                user.value = result.user;
                token.value = result.token;
                Sentry.setUser({ id: result.user.id, username: result.user.username });
                return true;
            }

            loginError.value = result.error ?? 'Registration failed';
            return false;
        } catch {
            loginError.value = 'Unexpected error during registration';
            return false;
        } finally {
            isLoggingIn.value = false;
        }
    }

    async function logout(): Promise<void> {
        try {
            const { useE2eeStore } = await import('./e2ee');
            const e2eeStore = useE2eeStore();
            await e2eeStore.wipeKeys();
        } catch (error) {
            console.error(error);
        }

        const server = getValidServer();
        if (server) {
            await window.api.auth.logout(server.host, server.id);
        }
        user.value = null;
        token.value = null;
        Sentry.setUser(null);
    }

    function clearError(): void {
        loginError.value = null;
    }

    function $reset(): void {
        user.value = null;
        token.value = null;
        isLoggingIn.value = false;
        loginError.value = null;
        challengeToken.value = null;
    }

    return {
        user,
        token,
        isLoggingIn,
        loginError,
        challengeToken,
        isAuthenticated,
        restoreSession,
        login,
        register,
        verifyTwoFactor,
        logout,
        clearError,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot));
}
