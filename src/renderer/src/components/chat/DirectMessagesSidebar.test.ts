import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import type { DmGroup } from '@/stores/directMessages';
import { useUsersStore } from '@/stores/users';
import DirectMessagesSidebar from './DirectMessagesSidebar.vue';

const getMembers = vi.fn();
vi.mock('@/api/members', () => ({ getMembers: (...a: unknown[]) => getMembers(...a) }));
vi.mock('@/lib/echo', async () => (await import('@/../../../test/helpers/echo')).echoMockFactory());

const stubs = {
    SimpleTooltip: { template: '<div><slot /></div>' },
    Avatar: { template: '<div><slot /></div>' },
    AvatarImage: { template: '<div><slot /></div>' },
    AvatarFallback: { template: '<div><slot /></div>' },
};

function dmGroup(id: string, overrides: Partial<DmGroup> = {}): DmGroup {
    return {
        id,
        name: `User ${id}`,
        other_user: { id: `u${id}`, username: `user${id}`, avatar_urls: null },
        last_message: null,
        last_message_at: null,
        ...overrides,
    };
}

function mountSidebar(props: Partial<{ dmGroups: DmGroup[]; selectedDmGroupId: string | null }> = {}) {
    return mount(DirectMessagesSidebar, {
        props: { dmGroups: props.dmGroups ?? [], selectedDmGroupId: props.selectedDmGroupId ?? null },
        global: { stubs },
    });
}

beforeEach(() => {
    getMembers.mockReset().mockResolvedValue({ data: [] });
});

describe('DirectMessagesSidebar rendering', () => {
    it('shows the empty state when there are no DM groups', () => {
        const wrapper = mountSidebar();
        expect(wrapper.text()).toContain('No direct messages yet');
    });

    it('renders a row per DM group with its name', () => {
        const wrapper = mountSidebar({
            dmGroups: [dmGroup('1', { name: 'Alice' }), dmGroup('2', { name: 'Bob' })],
        });
        expect(wrapper.text()).toContain('Alice');
        expect(wrapper.text()).toContain('Bob');
        expect(wrapper.text()).not.toContain('No direct messages yet');
    });

    it('renders a truncated last-message preview with the other user as sender', () => {
        const wrapper = mountSidebar({
            dmGroups: [
                dmGroup('1', {
                    name: 'Alice',
                    last_message: {
                        id: 'm1',
                        content: 'x'.repeat(60),
                        created_at: '2026-06-23T10:00:00Z',
                        user_id: 'u1',
                    },
                    last_message_at: '2026-06-23T10:00:00Z',
                }),
            ],
        });
        expect(wrapper.text()).toContain('user1:');
        expect(wrapper.text()).toContain('...');
    });

    it('prefixes the preview with "You" when the last message is from the current user', () => {
        const auth = useAuthStore();
        auth.user = { id: 'me', username: 'me', email: 'm@x.com', avatar_urls: null } as never;
        const wrapper = mountSidebar({
            dmGroups: [
                dmGroup('1', {
                    name: 'Alice',
                    last_message: { id: 'm1', content: 'hello', created_at: '2026-06-23T10:00:00Z', user_id: 'me' },
                    last_message_at: '2026-06-23T10:00:00Z',
                }),
            ],
        });
        expect(wrapper.text()).toContain('You:');
    });
});

describe('DirectMessagesSidebar selection', () => {
    it('emits selectDm with the group id when a DM row is clicked', async () => {
        const wrapper = mountSidebar({ dmGroups: [dmGroup('1', { name: 'Alice' })] });
        const row = wrapper.findAll('button').find((b) => b.text().includes('Alice'));
        await row!.trigger('click');
        expect(wrapper.emitted('selectDm')?.[0]).toEqual(['1']);
    });

    it('highlights the selected DM group', () => {
        const wrapper = mountSidebar({ dmGroups: [dmGroup('1', { name: 'Alice' })], selectedDmGroupId: '1' });
        const row = wrapper.findAll('button').find((b) => b.text().includes('Alice'));
        expect(row!.classes()).toContain('bg-sidebar-accent');
    });

    it('emits switchToChannels from the back button', async () => {
        const wrapper = mountSidebar();
        const back = wrapper.findAll('button').find((b) => b.text().includes('Back to Channels'));
        await back!.trigger('click');
        expect(wrapper.emitted('switchToChannels')).toBeTruthy();
    });
});

describe('DirectMessagesSidebar new-DM search', () => {
    it('toggles the search input open and shut', async () => {
        const wrapper = mountSidebar();
        expect(wrapper.find('input').exists()).toBe(false);
        await wrapper.find('button').trigger('click');
        expect(wrapper.find('input').exists()).toBe(true);
        await wrapper.find('button').trigger('click');
        expect(wrapper.find('input').exists()).toBe(false);
    });

    it('searches members and emits startDm with the chosen user id', async () => {
        getMembers.mockResolvedValue({
            data: [
                { id: 'u9', attributes: { username: 'searched', display_name: 'Searched User', avatar_urls: null } },
            ],
        });
        useUsersStore();
        const wrapper = mountSidebar();
        await wrapper.find('button').trigger('click');
        await wrapper.find('input').setValue('sea');
        // watchDebounced (300ms) drives the lookup.
        await vi.waitFor(() => expect(getMembers).toHaveBeenCalled());
        await flushPromises();

        expect(wrapper.text()).toContain('Searched User');
        const result = wrapper.findAll('button').find((b) => b.text().includes('Searched User'));
        await result!.trigger('click');
        expect(wrapper.emitted('startDm')?.[0]).toEqual(['u9']);
    });

    it('shows the no-results message when the search returns nothing', async () => {
        getMembers.mockResolvedValue({ data: [] });
        const wrapper = mountSidebar();
        await wrapper.find('button').trigger('click');
        await wrapper.find('input').setValue('zzz');
        await vi.waitFor(() => expect(getMembers).toHaveBeenCalled());
        await flushPromises();
        expect(wrapper.text()).toContain('No users found');
    });
});
