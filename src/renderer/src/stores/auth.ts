import { acceptHMRUpdate, defineStore } from 'pinia';
import { ref, computed, watch } from 'vue';
import type { AvatarUrls } from '@/types/chat';
import { useServerStore } from './server';
import { useUsersStore } from './users';

export interface AuthPermissions {
    canInviteMembers: boolean;
    canManageRoles: boolean;
    canManageChannels: boolean;
    canManageServer: boolean;
    canManageMessages: boolean;
    canBanMembers: boolean;
    canKickMembers: boolean;
    canMoveMembers: boolean;
    canViewAuditLog: boolean;
    isAdministrator: boolean;
    isBanned: boolean;
    isJailed: boolean;
}

export interface AuthUser {
    id: string;
    username: string;
    email: string;
    avatar_urls: AvatarUrls | null;
    permissions?: AuthPermissions;
}

/** Details of an active ban, used to render the banned screen. */
export interface BanInfo {
    reason: string | null;
    expires_at: string | null;
    permanent: boolean;
}

/** Outcome of a registration attempt. On failure, `fieldErrors` maps form field
 *  names to a human-readable reason (multiple backend messages joined). */
export interface RegisterResult {
    success: boolean;
    fieldErrors?: Record<string, string>;
}

export const useAuthStore = defineStore('auth', () => {
    const user = ref<AuthUser | null>(null);
    const token = ref<string | null>(null);
    const isLoggingIn = ref(false);
    const loginError = ref<string | null>(null);
    const challengeToken = ref<string | null>(null);
    const banInfo = ref<BanInfo | null>(null);

    const isAuthenticated = computed(() => !!user.value && !!token.value);

    function getValidServer(): { host: string } | null {
        const serverStore = useServerStore();
        const server = serverStore.activeServer;
        if (!server?.host) return null;
        return { host: server.host };
    }

    watch(
        user,
        (newUser) => {
            if (!newUser) return;
            const usersStore = useUsersStore();
            usersStore.upsert({
                id: newUser.id,
                username: newUser.username,
                display_name: newUser.username,
                avatar_urls: newUser.avatar_urls,
                permissions: newUser.permissions ?? null,
            });
        },
        { deep: true },
    );

    async function restoreSession(): Promise<boolean> {
        const server = getValidServer();
        if (!server) return false;

        const session = await window.api.auth.getSession();
        if (!session) return false;

        const result = await window.api.auth.validate(server.host, session.token);
        if (result.valid && result.user) {
            user.value = result.user;
            token.value = session.token;
            return true;
        }

        await window.api.auth.logout(server.host);
        return false;
    }

    async function login(email: string, password: string): Promise<boolean | 'two-factor' | 'banned'> {
        const server = getValidServer();
        if (!server) {
            loginError.value = 'No server connection';
            return false;
        }

        isLoggingIn.value = true;
        loginError.value = null;

        try {
            const result = await window.api.auth.login(server.host, email, password);

            if (result.banned) {
                banInfo.value = result.ban ?? { reason: null, expires_at: null, permanent: true };
                loginError.value = result.error ?? 'Your account has been banned.';
                return 'banned';
            }

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

    async function verifyTwoFactor(code: string | null, recoveryCode: string | null): Promise<boolean | 'banned'> {
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
                challengeToken.value,
                code,
                recoveryCode,
            );

            if (result.banned) {
                banInfo.value = result.ban ?? { reason: null, expires_at: null, permanent: true };
                loginError.value = result.error ?? 'Your account has been banned.';
                challengeToken.value = null;
                return 'banned';
            }

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

    async function register(
        inviteToken: string,
        username: string,
        email: string,
        password: string,
        passwordConfirmation: string,
    ): Promise<RegisterResult> {
        const server = getValidServer();
        if (!server) {
            loginError.value = 'No server connection';
            return { success: false };
        }

        isLoggingIn.value = true;
        loginError.value = null;

        try {
            const result = await window.api.auth.register(
                server.host,
                inviteToken,
                username,
                email,
                password,
                passwordConfirmation,
            );

            if (result.success && result.user && result.token) {
                user.value = result.user;
                token.value = result.token;
                return { success: true };
            }

            const fieldErrors: Record<string, string> = {};
            for (const [field, messages] of Object.entries(result.errors ?? {})) {
                if (!messages?.length) continue;
                const key = field === 'password_confirmation' ? 'passwordConfirmation' : field;
                fieldErrors[key] = messages.join(' ');
            }

            loginError.value = result.error ?? 'Registration failed';
            return { success: false, fieldErrors };
        } catch {
            loginError.value = 'Unexpected error during registration';
            return { success: false };
        } finally {
            isLoggingIn.value = false;
        }
    }

    async function logout(): Promise<void> {
        try {
            const { useVoiceStore } = await import('./voice');
            await useVoiceStore().leaveChannel();
        } catch (err) {
            console.warn('[Auth] Failed to leave voice on logout:', err);
        }
        const server = getValidServer();
        if (server) {
            await window.api.auth.logout(server.host);
        }
        user.value = null;
        token.value = null;
    }

    function clearError(): void {
        loginError.value = null;
    }

    function clearBan(): void {
        banInfo.value = null;
        loginError.value = null;
    }

    function $reset(): void {
        user.value = null;
        token.value = null;
        isLoggingIn.value = false;
        loginError.value = null;
        challengeToken.value = null;
        banInfo.value = null;
    }

    return {
        user,
        token,
        isLoggingIn,
        loginError,
        challengeToken,
        banInfo,
        isAuthenticated,
        restoreSession,
        login,
        register,
        verifyTwoFactor,
        logout,
        clearError,
        clearBan,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useAuthStore, import.meta.hot));
}
