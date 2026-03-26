import { ipcRenderer } from 'electron';

export const authApi = {
    login: (host: string, serverId: number, email: string, password: string) =>
        ipcRenderer.invoke('auth:login', host, serverId, email, password),
    twoFactorChallenge: (
        host: string,
        serverId: number,
        challengeToken: string,
        code: string | null,
        recoveryCode: string | null,
    ) => ipcRenderer.invoke('auth:twoFactorChallenge', host, serverId, challengeToken, code, recoveryCode),
    validateInvite: (host: string, token: string) => ipcRenderer.invoke('auth:validateInvite', host, token),
    register: (
        host: string,
        serverId: number,
        inviteToken: string,
        name: string,
        username: string,
        email: string,
        password: string,
        passwordConfirmation: string,
    ) =>
        ipcRenderer.invoke(
            'auth:register',
            host,
            serverId,
            inviteToken,
            name,
            username,
            email,
            password,
            passwordConfirmation,
        ),
    getSession: (serverId: number) => ipcRenderer.invoke('auth:getSession', serverId),
    logout: (host: string, serverId: number) => ipcRenderer.invoke('auth:logout', host, serverId),
    validate: (host: string, token: string) => ipcRenderer.invoke('auth:validate', host, token),
};
