export interface AvatarApi {
    resolve(userId: string, url: string): Promise<string | null>;
    forget(userId: string): Promise<void>;
}
