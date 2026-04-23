import api from './client';

export function forgotPassword(email: string): Promise<void> {
    return api.post('/auth/forgot-password', { email });
}

export function resetPassword(data: {
    email: string;
    code: string;
    password: string;
    password_confirmation: string;
}): Promise<void> {
    return api.post('/auth/reset-password', data);
}
