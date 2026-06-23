import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './auth';
import { useServerStore } from './server';

vi.mock('@/lib/echo', async () => (await import('@/../../../test/helpers/echo')).echoMockFactory());

const SERVER = { id: 1, name: 'S', host: 'example.com', is_active: true, created_at: '2026-01-01' };
const USER = { id: '5', username: 'alice', email: 'a@x.com', avatar_urls: null };

function withServer() {
    useServerStore().activeServer = { ...SERVER };
}

beforeEach(() => {
    setActivePinia(createPinia());
});

describe('login', () => {
    it('authenticates on success', async () => {
        withServer();
        window.api.auth.login = vi.fn().mockResolvedValue({ success: true, user: USER, token: 'tok' });
        const auth = useAuthStore();

        const result = await auth.login('a@x.com', 'pw');
        expect(result).toBe(true);
        expect(auth.user).toEqual(USER);
        expect(auth.token).toBe('tok');
        expect(auth.isAuthenticated).toBe(true);
        expect(auth.isLoggingIn).toBe(false);
    });

    it('returns "two-factor" and stores the challenge token', async () => {
        withServer();
        window.api.auth.login = vi.fn().mockResolvedValue({ twoFactor: true, challengeToken: 'ch' });
        const auth = useAuthStore();
        expect(await auth.login('a@x.com', 'pw')).toBe('two-factor');
        expect(auth.challengeToken).toBe('ch');
        expect(auth.isAuthenticated).toBe(false);
    });

    it('sets loginError on failure', async () => {
        withServer();
        window.api.auth.login = vi.fn().mockResolvedValue({ success: false, error: 'Bad creds' });
        const auth = useAuthStore();
        expect(await auth.login('a@x.com', 'pw')).toBe(false);
        expect(auth.loginError).toBe('Bad creds');
    });

    it('fails fast with no server connection', async () => {
        const auth = useAuthStore();
        expect(await auth.login('a@x.com', 'pw')).toBe(false);
        expect(auth.loginError).toBe('No server connection');
    });

    it('handles a thrown error', async () => {
        withServer();
        window.api.auth.login = vi.fn().mockRejectedValue(new Error('network'));
        const auth = useAuthStore();
        expect(await auth.login('a@x.com', 'pw')).toBe(false);
        expect(auth.loginError).toBe('Unexpected error during login');
    });
});

describe('verifyTwoFactor', () => {
    it('completes login with a valid code', async () => {
        withServer();
        const auth = useAuthStore();
        window.api.auth.login = vi.fn().mockResolvedValue({ twoFactor: true, challengeToken: 'ch' });
        await auth.login('a@x.com', 'pw');

        window.api.auth.twoFactorChallenge = vi.fn().mockResolvedValue({ success: true, user: USER, token: 'tok' });
        expect(await auth.verifyTwoFactor('123456', null)).toBe(true);
        expect(auth.isAuthenticated).toBe(true);
        expect(auth.challengeToken).toBeNull();
    });

    it('guards when there is no active challenge', async () => {
        withServer();
        const auth = useAuthStore();
        expect(await auth.verifyTwoFactor('123456', null)).toBe(false);
        expect(auth.loginError).toContain('No active challenge');
    });
});

describe('register', () => {
    it('maps password_confirmation field errors to passwordConfirmation', async () => {
        withServer();
        window.api.auth.register = vi.fn().mockResolvedValue({
            success: false,
            errors: { password_confirmation: ['does not match'], email: ['taken'] },
        });
        const auth = useAuthStore();
        const result = await auth.register('inv', 'u', 'e@x.com', 'pw', 'pw2');
        expect(result.success).toBe(false);
        expect(result.fieldErrors?.passwordConfirmation).toBe('does not match');
        expect(result.fieldErrors?.email).toBe('taken');
    });

    it('authenticates on successful registration', async () => {
        withServer();
        window.api.auth.register = vi.fn().mockResolvedValue({ success: true, user: USER, token: 'tok' });
        const auth = useAuthStore();
        const result = await auth.register('inv', 'u', 'e@x.com', 'pw', 'pw');
        expect(result.success).toBe(true);
        expect(auth.isAuthenticated).toBe(true);
    });
});

describe('restoreSession', () => {
    it('returns false when there is no server', async () => {
        const auth = useAuthStore();
        expect(await auth.restoreSession()).toBe(false);
    });

    it('hydrates from a valid stored session', async () => {
        withServer();
        window.api.auth.getSession = vi.fn().mockResolvedValue({ token: 'tok' });
        window.api.auth.validate = vi.fn().mockResolvedValue({ valid: true, user: USER });
        const auth = useAuthStore();
        expect(await auth.restoreSession()).toBe(true);
        expect(auth.isAuthenticated).toBe(true);
    });

    it('logs out when the stored token is invalid', async () => {
        withServer();
        window.api.auth.getSession = vi.fn().mockResolvedValue({ token: 'tok' });
        window.api.auth.validate = vi.fn().mockResolvedValue({ valid: false });
        const logout = vi.fn().mockResolvedValue({ success: true });
        window.api.auth.logout = logout;
        const auth = useAuthStore();
        expect(await auth.restoreSession()).toBe(false);
        expect(logout).toHaveBeenCalledWith('example.com');
    });
});

describe('logout', () => {
    it('clears user and token', async () => {
        withServer();
        window.api.auth.login = vi.fn().mockResolvedValue({ success: true, user: USER, token: 'tok' });
        const auth = useAuthStore();
        await auth.login('a@x.com', 'pw');
        await auth.logout();
        expect(auth.user).toBeNull();
        expect(auth.token).toBeNull();
        expect(auth.isAuthenticated).toBe(false);
    });
});
