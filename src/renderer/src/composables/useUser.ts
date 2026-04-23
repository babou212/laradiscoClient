import { computed, unref, watchEffect, type MaybeRef } from 'vue';
import { useUsersStore, type StoredUser } from '@/stores/users';

export function useUser(id: MaybeRef<string | number | null | undefined>) {
    const store = useUsersStore();

    watchEffect(() => {
        const raw = unref(id);
        if (raw === null || raw === undefined || raw === '') return;
        const uid = String(raw);
        if (!store.byId.has(uid)) {
            void store.fetch(uid);
        }
    });

    return computed<StoredUser | null>(() => {
        const raw = unref(id);
        if (raw === null || raw === undefined || raw === '') return null;
        return store.get(String(raw));
    });
}
