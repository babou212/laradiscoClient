import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useServerStore } from './server';

export interface AuthPermissions {
    canInviteMembers: boolean;
    canManageRoles: boolean;
    canManageChannels: boolean;
    canManageServer: boolean;
    canManageMessages: boolean;
    isAdministrator: boolean;
}

export interface AuthUser {
    id: number;
    name: string;
    username: string;
    email: string;
    avatar_path: string | null;
    permissions?: AuthPermissions;
}

export const useAuthStore = defineStore('auth', () => {
    const user = ref<AuthUser | null>(null);
    const token = ref<string | null>(null);
    const isLoggingIn = ref(false);
    const loginError = ref<string | null>(null);
    const challengeToken = ref<string | null>(null);

    const isAuthenticated = computed(() => !!user.value && !!token.value);

    async function restoreSession(): Promise<boolean> {
        const serverStore = useServerStore();
        if (!serverStore.activeServer) return false;

        const session = await window.api.auth.getSession(serverStore.activeServer.id);
        if (!session) return false;

        const result = await window.api.auth.validate(serverStore.activeServer.host, session.token);
        if (result.valid && result.user) {
            user.value = result.user;
            token.value = session.token;
            return true;
        }

        await window.api.auth.logout(serverStore.activeServer.host, serverStore.activeServer.id);
        return false;
    }

    async function login(email: string, password: string): Promise<boolean | 'two-factor'> {
        const serverStore = useServerStore();
        if (!serverStore.activeServer) {
            loginError.value = 'No server connection';
            return false;
        }

        isLoggingIn.value = true;
        loginError.value = null;

        try {
            const result = await window.api.auth.login(
                serverStore.activeServer.host,
                serverStore.activeServer.id,
                email,
                password,
            );

            if (result.twoFactor && result.challengeToken) {
                challengeToken.value = result.challengeToken;
                return 'two-factor';
            }

            if (result.success && result.user && result.token) {
                user.value = result.user;
                token.value = result.token;
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

    async function verifyTwoFactor(
        code: string | null,
        recoveryCode: string | null,
    ): Promise<boolean> {
        const serverStore = useServerStore();
        if (!serverStore.activeServer || !challengeToken.value) {
            loginError.value = 'No active challenge. Please log in again.';
            return false;
        }

        isLoggingIn.value = true;
        loginError.value = null;

        try {
            const result = await window.api.auth.twoFactorChallenge(
                serverStore.activeServer.host,
                serverStore.activeServer.id,
                challengeToken.value,
                code,
                recoveryCode,
            );

            if (result.success && result.user && result.token) {
                user.value = result.user;
                token.value = result.token;
                challengeToken.value = null;
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

    async function logout(): Promise<void> {
        const serverStore = useServerStore();

        // Wipe E2EE keys from local storage before clearing auth state
        try {
            const { useE2eeStore } = await import('./e2ee');
            const e2eeStore = useE2eeStore();
            await e2eeStore.wipeKeys();
        } catch {
            // E2EE store may not be initialized
        }

        if (serverStore.activeServer) {
            await window.api.auth.logout(
                serverStore.activeServer.host,
                serverStore.activeServer.id,
            );
        }
        user.value = null;
        token.value = null;
    }

    function clearError(): void {
        loginError.value = null;
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
        verifyTwoFactor,
        logout,
        clearError,
    };
});
