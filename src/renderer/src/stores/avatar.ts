import { acceptHMRUpdate, defineStore } from 'pinia';
import { reactive } from 'vue';
import { useAuthStore } from './auth';
import api from '@/lib/api';
import type { AvatarUrls } from '@/types/chat';

export type AvatarSize = keyof AvatarUrls;

export const useAvatarStore = defineStore('avatar', () => {
    const cache = reactive(new Map<number, AvatarUrls>());

    function getAvatarUrl(userId: number, size: AvatarSize = 'thumb'): string | null {
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

    function setAvatar(userId: number, avatarUrls: AvatarUrls | null): void {
        if (avatarUrls) {
            cache.set(userId, avatarUrls);
        } else {
            cache.delete(userId);
        }
    }

    function removeAvatar(userId: number): void {
        cache.delete(userId);
    }

    function hydrateFromUsers(users: Array<{ id: number; avatar_urls?: AvatarUrls | null }>): void {
        for (const user of users) {
            if (user.avatar_urls) {
                cache.set(user.id, user.avatar_urls);
            }
        }
    }

    async function uploadAvatar(blob: Blob): Promise<void> {
        const authStore = useAuthStore();
        const formData = new FormData();
        const ext = blob.type === 'image/gif' ? 'gif' : 'png';
        formData.append('avatar', blob, `avatar.${ext}`);
        const response = await api.post('/settings/profile/avatar', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (response.data?.avatar_urls && authStore.user) {
            const urls: AvatarUrls = response.data.avatar_urls;
            authStore.user.avatar_urls = urls;
            setAvatar(authStore.user.id, urls);
        }
    }

    async function deleteAvatar(): Promise<void> {
        const authStore = useAuthStore();
        await api.delete('/settings/profile/avatar');
        if (authStore.user) {
            authStore.user.avatar_urls = null;
            removeAvatar(authStore.user.id);
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
        uploadAvatar,
        deleteAvatar,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useAvatarStore, import.meta.hot));
}
