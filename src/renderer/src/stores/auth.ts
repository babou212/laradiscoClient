import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useServerStore } from './server';

export interface AuthUser {
    id: number;
    name: string;
    username: string;
    email: string;
    avatar_path: string | null;
}

export const useAuthStore = defineStore('auth', () => {
    const user = ref<AuthUser | null>(null);
    const token = ref<string | null>(null);
    const isLoggingIn = ref(false);
    const loginError = ref<string | null>(null);

    const isAuthenticated = computed(() => !!user.value && !!token.value);

    /**
     * Try to restore an existing auth session from local DB for the active server.
     * Validates the token is still good with the server.
     */
    async function restoreSession(): Promise<boolean> {
        const serverStore = useServerStore();
        if (!serverStore.activeServer) return false;

        const session = await window.api.auth.getSession(serverStore.activeServer.id);
        if (!session) return false;

        // Validate the token is still valid
        const result = await window.api.auth.validate(serverStore.activeServer.host, session.token);
        if (result.valid && result.user) {
            user.value = result.user;
            token.value = session.token;
            return true;
        }

        // Token expired/revoked — clean up
        await window.api.auth.logout(serverStore.activeServer.host, serverStore.activeServer.id);
        return false;
    }

    /**
     * Login with email and password.
     */
    async function login(email: string, password: string): Promise<boolean> {
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

    /**
     * Logout and revoke token.
     */
    async function logout(): Promise<void> {
        const serverStore = useServerStore();
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
        isAuthenticated,
        restoreSession,
        login,
        logout,
        clearError,
    };
});
