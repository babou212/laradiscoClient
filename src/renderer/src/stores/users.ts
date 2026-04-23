import { acceptHMRUpdate, defineStore } from 'pinia';
import { computed, reactive } from 'vue';
import type { AuthPermissions } from './auth';
import { getMembers } from '@/api/members';
import { getPresence } from '@/api/presence';
import {
    findIncluded,
    relationshipIds,
    type JsonApiCollectionResponse,
    type RoleResource,
    type UserResource,
} from '@/api/types';
import { getUserProfile } from '@/api/users';
import { getEcho } from '@/lib/echo';
import type { OnlineUser, UserStatusType } from '@/types';
import type { AvatarUrls } from '@/types/chat';

export interface StoredUserRole {
    id: string;
    name: string;
    color: string;
    position: number;
    is_hoisted?: boolean;
    is_mentionable?: boolean;
    is_default?: boolean;
}

export interface StoredUser {
    id: string;
    username: string;
    display_name: string;
    name: string | null;
    nickname: string | null;
    about_me: string | null;
    avatar_urls: AvatarUrls | null;
    status: UserStatusType;
    custom_status: string | null;
    roles: StoredUserRole[];
    permissions: AuthPermissions | null;
    created_at: string | null;
    fetchedAt: number;
}

interface ProfileUpdatedPayload {
    user_id: number | string;
    username: string;
    display_name: string | null;
    nickname?: string | null;
    about_me?: string | null;
    avatar_urls: AvatarUrls | null;
}

interface PresenceUpdatedPayload {
    user_id: number | string;
    username: string;
    display_name?: string | null;
    avatar_urls?: AvatarUrls | null;
    status: UserStatusType;
    custom_status: string | null;
}

interface RolesUpdatedPayload {
    user_id: number | string;
    roles: StoredUserRole[];
    permissions: AuthPermissions;
}

interface MemberJoinedPayload {
    user_id: number | string;
    username: string;
    display_name?: string | null;
    avatar_urls?: AvatarUrls | null;
    custom_status?: string | null;
}

type AvatarSize = keyof AvatarUrls;

function rolesFromIncluded(rel: { data?: unknown } | undefined, included: unknown): StoredUserRole[] {
    const ids = relationshipIds(rel as Parameters<typeof relationshipIds>[0]);
    if (ids.length === 0) return [];
    const resources = findIncluded<RoleResource>(included as Parameters<typeof findIncluded>[0], 'roles', ids);
    const byRoleId = new Map<string, StoredUserRole>();
    for (const r of resources) {
        if (byRoleId.has(r.id)) continue;
        byRoleId.set(r.id, {
            id: r.id,
            name: r.attributes.name,
            color: r.attributes.color,
            position: r.attributes.position,
            is_hoisted: r.attributes.is_hoisted,
            is_mentionable: r.attributes.is_mentionable,
            is_default: r.attributes.is_default,
        });
    }
    return Array.from(byRoleId.values()).sort((a, b) => b.position - a.position);
}

export const useUsersStore = defineStore('users', () => {
    const byId = reactive(new Map<string, StoredUser>());
    const inFlight = new Map<string, Promise<StoredUser | null>>();
    let channel: ReturnType<ReturnType<typeof getEcho>['private']> | null = null;

    const members = computed(() => Array.from(byId.values()));
    const onlineMembers = computed(() => members.value.filter((u) => u.status !== 'offline'));

    function get(id: string): StoredUser | null {
        return byId.get(id) ?? null;
    }

    function displayName(id: string, fallback?: string): string {
        return byId.get(id)?.display_name ?? fallback ?? 'Unknown User';
    }

    function avatarUrl(id: string, size: AvatarSize = 'thumb'): string | null {
        const urls = byId.get(id)?.avatar_urls;
        if (!urls) return null;
        if (urls.original && /\.gif($|\?)/i.test(urls.original)) {
            return urls.original;
        }
        return urls[size];
    }

    function upsert(patch: Partial<StoredUser> & { id: string }): StoredUser {
        const existing = byId.get(patch.id);
        const pick = <K extends keyof StoredUser>(key: K, fallback: StoredUser[K]): StoredUser[K] =>
            Object.prototype.hasOwnProperty.call(patch, key)
                ? (patch[key] as StoredUser[K])
                : existing
                  ? existing[key]
                  : fallback;

        const username = pick('username', '');
        const merged: StoredUser = {
            id: patch.id,
            username,
            display_name: pick('display_name', username),
            name: pick('name', null),
            nickname: pick('nickname', null),
            about_me: pick('about_me', null),
            avatar_urls: pick('avatar_urls', null),
            status: pick('status', 'offline'),
            custom_status: pick('custom_status', null),
            roles: pick('roles', []),
            permissions: pick('permissions', null),
            created_at: pick('created_at', null),
            fetchedAt: pick('fetchedAt', Date.now()),
        };
        byId.set(patch.id, merged);
        return merged;
    }

    function hydrateFromMembersResponse(response: JsonApiCollectionResponse<UserResource>): void {
        for (const resource of response.data) {
            const attrs = resource.attributes;
            const rolesRel = resource.relationships?.roles;
            upsert({
                id: resource.id,
                username: attrs.username,
                display_name: attrs.display_name || attrs.nickname || attrs.name || attrs.username,
                name: attrs.name ?? null,
                nickname: attrs.nickname ?? null,
                avatar_urls: attrs.avatar_urls ?? null,
                status: (attrs as { status?: UserStatusType }).status ?? 'offline',
                custom_status: attrs.custom_status ?? null,
                roles: rolesFromIncluded(rolesRel, response.included),
                created_at: attrs.created_at ?? null,
                fetchedAt: Date.now(),
            });
        }
    }

    function hydrateFromUserResponse(resource: UserResource, included?: unknown[]): StoredUser {
        const attrs = resource.attributes;
        const rolesRel = resource.relationships?.roles;
        return upsert({
            id: resource.id,
            username: attrs.username,
            display_name: attrs.display_name || attrs.nickname || attrs.name || attrs.username,
            name: attrs.name ?? null,
            nickname: attrs.nickname ?? null,
            about_me: attrs.about_me ?? null,
            avatar_urls: attrs.avatar_urls ?? null,
            status: 'offline',
            custom_status: attrs.custom_status ?? null,
            roles: rolesFromIncluded(rolesRel, included),
            created_at: attrs.created_at ?? null,
            fetchedAt: Date.now(),
        });
    }

    function hydrateFromUsers(
        users: Array<{ id: string; username?: string; display_name?: string; avatar_urls?: AvatarUrls | null }>,
    ): void {
        for (const u of users) {
            if (!u?.id) continue;
            const patch: Partial<StoredUser> & { id: string } = { id: String(u.id) };
            if (u.username !== undefined) patch.username = u.username;
            if (u.display_name !== undefined) patch.display_name = u.display_name;
            if (u.avatar_urls !== undefined) patch.avatar_urls = u.avatar_urls;
            upsert(patch);
        }
    }

    function applyPresenceBatch(users: OnlineUser[]): void {
        const seenIds = new Set<string>();
        for (const u of users) {
            const id = String(u.id);
            seenIds.add(id);
            upsert({
                id,
                username: u.username,
                display_name: u.display_name ?? u.username,
                avatar_urls: u.avatar_urls ?? undefined,
                status: u.status ?? 'online',
                custom_status: u.custom_status ?? null,
            });
        }
        for (const [id, user] of byId) {
            if (!seenIds.has(id) && user.status !== 'offline') {
                upsert({ id, status: 'offline' });
            }
        }
    }

    function applyProfileUpdate(data: ProfileUpdatedPayload): void {
        const id = String(data.user_id);
        const display = data.display_name ?? data.username;
        upsert({
            id,
            username: data.username,
            display_name: display,
            nickname: data.nickname ?? null,
            about_me: data.about_me ?? null,
            avatar_urls: data.avatar_urls ?? null,
        });
    }

    function applyPresenceUpdate(data: PresenceUpdatedPayload): void {
        const id = String(data.user_id);
        upsert({
            id,
            username: data.username,
            display_name: data.display_name ?? data.username,
            avatar_urls: data.avatar_urls ?? undefined,
            status: data.status,
            custom_status: data.custom_status,
        });
    }

    function applyRolesUpdate(data: RolesUpdatedPayload, currentAuthUserId: string | null): void {
        const id = String(data.user_id);
        const existing = byId.get(id);
        upsert({
            id,
            roles: data.roles,
            permissions: id === currentAuthUserId ? data.permissions : (existing?.permissions ?? null),
        });
    }

    function applyMemberJoined(data: MemberJoinedPayload): void {
        const id = String(data.user_id);
        if (byId.has(id)) return;
        upsert({
            id,
            username: data.username,
            display_name: data.display_name ?? data.username,
            avatar_urls: data.avatar_urls ?? null,
            custom_status: data.custom_status ?? null,
            status: 'offline',
        });
    }

    async function fetch(id: string): Promise<StoredUser | null> {
        const existing = inFlight.get(id);
        if (existing) return existing;

        const promise = (async () => {
            try {
                const response = await getUserProfile(id);
                return hydrateFromUserResponse(response.data, response.included);
            } catch (error) {
                console.error('Failed to fetch user', id, error);
                return null;
            } finally {
                inFlight.delete(id);
            }
        })();

        inFlight.set(id, promise);
        return promise;
    }

    async function connect(currentAuthUserId: string | null): Promise<void> {
        if (channel) return;

        try {
            const echo = getEcho();
            channel = echo.private('presence');
            channel.listen('.user.profile.updated', (data: ProfileUpdatedPayload) => applyProfileUpdate(data));
            channel.listen('.user.presence.updated', (data: PresenceUpdatedPayload) => applyPresenceUpdate(data));
            channel.listen('.user.roles.updated', (data: RolesUpdatedPayload) =>
                applyRolesUpdate(data, currentAuthUserId),
            );
            channel.listen('.server.member.joined', (data: MemberJoinedPayload) => applyMemberJoined(data));
        } catch (error) {
            console.error('Failed to subscribe users store to presence channel', error);
        }

        try {
            const response = await getMembers();
            hydrateFromMembersResponse(response);
        } catch (error) {
            console.error('Failed to hydrate members', error);
        }

        try {
            const presence = await getPresence();
            applyPresenceBatch(presence?.data ?? []);
        } catch (error) {
            console.error('Failed to hydrate presence', error);
        }
    }

    function disconnect(): void {
        if (!channel) return;
        try {
            const echo = getEcho();
            echo.leave('presence');
        } catch (error) {
            console.error(error);
        }
        channel = null;
    }

    function $reset(): void {
        disconnect();
        byId.clear();
        inFlight.clear();
    }

    return {
        byId,
        members,
        onlineMembers,
        get,
        displayName,
        avatarUrl,
        upsert,
        fetch,
        hydrateFromUserResponse,
        hydrateFromUsers,
        applyPresenceBatch,
        applyProfileUpdate,
        applyPresenceUpdate,
        applyRolesUpdate,
        applyMemberJoined,
        connect,
        disconnect,
        $reset,
    };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useUsersStore, import.meta.hot));
}
