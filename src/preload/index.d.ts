import type { ElectronAPI } from '@electron-toolkit/preload';

interface ServerConnection {
    id: number;
    name: string;
    host: string;
    is_active: boolean;
    created_at: string;
}

interface AuthUser {
    id: number;
    name: string;
    username: string;
    email: string;
    avatar_path: string | null;
}

interface AuthSession {
    id: number;
    server_id: number;
    user_id: number;
    user_name: string;
    user_email: string;
    user_avatar: string | null;
    token: string;
    created_at: string;
}

interface ServerApi {
    ping: (host: string) => Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }>;
    save: (name: string, host: string) => Promise<{ success: boolean; connection?: ServerConnection; error?: string }>;
    getActive: () => Promise<ServerConnection | null>;
    getAll: () => Promise<ServerConnection[]>;
    setActive: (id: number) => Promise<{ success: boolean }>;
    remove: (id: number) => Promise<{ success: boolean }>;
}

interface AuthApi {
    login: (
        host: string,
        serverId: number,
        email: string,
        password: string,
    ) => Promise<{ success: boolean; user?: AuthUser; token?: string; error?: string }>;
    getSession: (serverId: number) => Promise<AuthSession | null>;
    logout: (host: string, serverId: number) => Promise<{ success: boolean }>;
    validate: (host: string, token: string) => Promise<{ valid: boolean; user?: AuthUser }>;
}

interface AppApi {
    server: ServerApi;
    auth: AuthApi;
}

declare global {
    interface Window {
        electron: ElectronAPI;
        api: AppApi;
    }
}
