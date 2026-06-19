export interface AvatarApi {
    resolve(url: string): Promise<string | null>;
}
