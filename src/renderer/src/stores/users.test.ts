import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUsersStore } from './users';

vi.mock('@/lib/echo', async () => (await import('@/../../../test/helpers/echo')).echoMockFactory());
vi.mock('@/api/members', () => ({ getMembers: vi.fn() }));
vi.mock('@/api/presence', () => ({ getPresence: vi.fn() }));
vi.mock('@/api/users', () => ({ getUserProfile: vi.fn() }));

const AVATARS = {
    thumb: 'https://cdn.example.com/media/9/thumb.png',
    small: 'https://cdn.example.com/media/9/small.png',
    medium: 'https://cdn.example.com/media/9/medium.png',
    original: 'https://cdn.example.com/media/9/original.png',
};

beforeEach(() => {
    setActivePinia(createPinia());
});

describe('upsert', () => {
    it('creates a user with defaults', () => {
        const users = useUsersStore();
        const u = users.upsert({ id: '1', username: 'alice' });
        expect(u).toMatchObject({ id: '1', username: 'alice', display_name: 'alice', status: 'offline' });
    });

    it('merges without clobbering unspecified fields', () => {
        const users = useUsersStore();
        users.upsert({ id: '1', username: 'alice', display_name: 'Alice A', status: 'online' });
        users.upsert({ id: '1', custom_status: 'busy' });
        const u = users.get('1');
        expect(u).toMatchObject({ display_name: 'Alice A', status: 'online', custom_status: 'busy' });
    });
});

describe('members / onlineMembers', () => {
    it('excludes deleted users and filters offline for online list', () => {
        const users = useUsersStore();
        users.upsert({ id: '1', username: 'a', status: 'online' });
        users.upsert({ id: '2', username: 'b', status: 'offline' });
        users.upsert({ id: '3', username: 'c', status: 'online', deleted: true });
        expect(users.members.map((u) => u.id).sort()).toEqual(['1', '2']);
        expect(users.onlineMembers.map((u) => u.id)).toEqual(['1']);
    });
});

describe('hydrateFromUsers', () => {
    it('upserts each user, skipping entries without an id', () => {
        const users = useUsersStore();
        users.hydrateFromUsers([{ id: '1', username: 'a' }, { id: '', username: 'skip' } as never]);
        expect(users.get('1')?.username).toBe('a');
        expect(users.members).toHaveLength(1);
    });
});

describe('avatarUrl resolution', () => {
    it('returns the remote URL first, then the locally-cached path once resolved', async () => {
        window.api.avatar.resolve = vi.fn().mockResolvedValue('app://avatar/local.png');
        const users = useUsersStore();
        users.upsert({ id: '9', username: 'alice', avatar_urls: AVATARS });

        const first = users.avatarUrl('9', 'thumb');
        expect(first).toBe(AVATARS.thumb);
        expect(window.api.avatar.resolve).toHaveBeenCalledWith('9', AVATARS.thumb);

        await flushPromises();
        expect(users.avatarUrl('9', 'thumb')).toBe('app://avatar/local.png');
    });

    it('does not re-resolve a key while a resolution is in flight', async () => {
        window.api.avatar.resolve = vi.fn().mockResolvedValue('app://avatar/local.png');
        const users = useUsersStore();
        users.upsert({ id: '9', username: 'alice', avatar_urls: AVATARS });
        users.avatarUrl('9', 'thumb');
        users.avatarUrl('9', 'thumb');
        expect(window.api.avatar.resolve).toHaveBeenCalledTimes(1);
    });

    it('returns null when the user has no avatar', () => {
        const users = useUsersStore();
        users.upsert({ id: '1', username: 'a' });
        expect(users.avatarUrl('1')).toBeNull();
    });
});
