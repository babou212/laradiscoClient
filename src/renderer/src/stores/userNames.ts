import { acceptHMRUpdate, defineStore } from 'pinia';
import { reactive } from 'vue';
import { useAuthStore } from './auth';

export const useUserNamesStore = defineStore('userNames', () => {
    const cache = reactive(new Map<string, string>());

    function getDisplayName(userId: string, fallback?: string): string {
        return cache.get(userId) ?? fallback ?? 'Unknown User';
    }

    function getCurrentUserDisplayName(): string {
        const authStore = useAuthStore();
        const userId = authStore.user?.id;
        if (!userId) return 'Unknown User';
        return getDisplayName(userId, authStore.user?.name);
    }

    function setDisplayName(userId: string, displayName: string): void {
        cache.set(userId, displayName);
    }

    function hydrateFromUsers(
        users: Array<{ id: string; display_name?: string; name?: string; username?: string }>,
    ): void {
        for (const user of users) {
            const name = user.display_name || user.name || user.username;
            if (name) {
                cache.set(user.id, name);
            }
        }
    }

    function $reset(): void {
        cache.clear();
    }

    return {
        cache,
        getDisplayName,
        getCurrentUserDisplayName,
        setDisplayName,
        hydrateFromUsers,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useUserNamesStore, import.meta.hot));
}
