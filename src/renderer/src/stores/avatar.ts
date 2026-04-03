import { acceptHMRUpdate, defineStore } from 'pinia';
import { reactive } from 'vue';
import { useAuthStore } from './auth';
import type { AvatarUrls } from '@/types/chat';

export type AvatarSize = keyof AvatarUrls;

export const useAvatarStore = defineStore('avatar', () => {
    const cache = reactive(new Map<string, AvatarUrls>());

    function getAvatarUrl(userId: string, size: AvatarSize = 'thumb'): string | null {
        const urls = cache.get(userId);
        if (!urls) return null;
        // Use original URL for GIF avatars to preserve animation
        if (urls.original && /\.gif($|\?)/i.test(urls.original)) {
            return urls.original;
        }
        return urls[size];
    }

    function getCurrentUserAvatarUrl(size: AvatarSize = 'thumb'): string | null {
        const authStore = useAuthStore();
        const userId = authStore.user?.id;
        if (!userId) return null;
        return getAvatarUrl(userId, size);
    }

    function setAvatar(userId: string, avatarUrls: AvatarUrls | null): void {
        if (avatarUrls) {
            cache.set(userId, avatarUrls);
        } else {
            cache.delete(userId);
        }
    }

    function removeAvatar(userId: string): void {
        cache.delete(userId);
    }

    function hydrateFromUsers(users: Array<{ id: string; avatar_urls?: AvatarUrls | null }>): void {
        for (const user of users) {
            if (user.avatar_urls) {
                cache.set(user.id, user.avatar_urls);
            }
        }
    }

    function $reset(): void {
        cache.clear();
    }

    return {
        cache,
        getAvatarUrl,
        getCurrentUserAvatarUrl,
        setAvatar,
        removeAvatar,
        hydrateFromUsers,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useAvatarStore, import.meta.hot));
}
