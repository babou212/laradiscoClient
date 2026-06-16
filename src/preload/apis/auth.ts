import { ipcRenderer } from 'electron';

export const authApi = {
    login: (host: string, email: string, password: string) => ipcRenderer.invoke('auth:login', host, email, password),
    twoFactorChallenge: (host: string, challengeToken: string, code: string | null, recoveryCode: string | null) =>
        ipcRenderer.invoke('auth:twoFactorChallenge', host, challengeToken, code, recoveryCode),
    validateInvite: (host: string, token: string) => ipcRenderer.invoke('auth:validateInvite', host, token),
    register: (
        host: string,
        inviteToken: string,
        username: string,
        email: string,
        password: string,
        passwordConfirmation: string,
    ) => ipcRenderer.invoke('auth:register', host, inviteToken, username, email, password, passwordConfirmation),
    getSession: () => ipcRenderer.invoke('auth:getSession'),
    logout: (host: string) => ipcRenderer.invoke('auth:logout', host),
    validate: (host: string, token: string) => ipcRenderer.invoke('auth:validate', host, token),
};
