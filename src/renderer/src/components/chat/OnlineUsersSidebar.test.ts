import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDirectMessagesStore } from '@/stores/directMessages';
import { useUsersStore } from '@/stores/users';
import OnlineUsersSidebar from './OnlineUsersSidebar.vue';

vi.mock('@/lib/echo', async () => (await import('@/../../../test/helpers/echo')).echoMockFactory());

const routerPush = vi.fn();
vi.mock('vue-router', () => ({ useRouter: () => ({ push: routerPush }) }));

const stubs = {
    Avatar: { template: '<div><slot /></div>' },
    AvatarImage: { template: '<div><slot /></div>' },
    AvatarFallback: { template: '<div><slot /></div>' },
    UserProfilePanel: {
        props: ['user', 'show', 'isCurrentUser'],
        emits: ['close', 'sendMessage'],
        template:
            '<div class="user-profile-panel">{{ user.display_name }}' +
            '<button class="profile-send" @click="$emit(\'sendMessage\', user.id)">send</button></div>',
    },
};

function mountSidebar() {
    return mount(OnlineUsersSidebar, { global: { stubs } });
}

beforeEach(() => {
    routerPush.mockReset();
});

describe('OnlineUsersSidebar grouping', () => {
    it('groups members into status sections with counts and omits empty sections', () => {
        const users = useUsersStore();
        users.upsert({ id: '1', username: 'a', display_name: 'Alice', status: 'online' });
        users.upsert({ id: '2', username: 'b', display_name: 'Bob', status: 'online' });
        users.upsert({ id: '3', username: 'd', display_name: 'Dan', status: 'dnd' });
        users.upsert({ id: '4', username: 'o', display_name: 'Olive', status: 'offline' });

        const wrapper = mountSidebar();
        expect(wrapper.text()).toContain('Online — 2');
        expect(wrapper.text()).toContain('Do Not Disturb — 1');
        expect(wrapper.text()).toContain('Offline — 1');
        // No idle members, so that section header is absent.
        expect(wrapper.text()).not.toContain('Idle —');
        expect(wrapper.text()).toContain('Alice');
        expect(wrapper.text()).toContain('Dan');
        expect(wrapper.text()).toContain('Olive');
    });

    it('renders a custom status under a member when present', () => {
        const users = useUsersStore();
        users.upsert({ id: '1', username: 'a', display_name: 'Alice', status: 'online', custom_status: 'busy coding' });
        const wrapper = mountSidebar();
        expect(wrapper.text()).toContain('busy coding');
    });

    it('excludes deleted users from the roster', () => {
        const users = useUsersStore();
        users.upsert({ id: '1', username: 'a', display_name: 'Alice', status: 'online' });
        users.upsert({ id: '2', username: 'g', display_name: 'Ghost', status: 'online', deleted: true });
        const wrapper = mountSidebar();
        expect(wrapper.text()).toContain('Online — 1');
        expect(wrapper.text()).not.toContain('Ghost');
    });
});

describe('OnlineUsersSidebar section collapse', () => {
    it('collapses a section to hide its members, then expands again', async () => {
        const users = useUsersStore();
        users.upsert({ id: '1', username: 'a', display_name: 'Alice', status: 'online' });
        const wrapper = mountSidebar();

        const header = wrapper.findAll('button').find((b) => b.text().includes('Online —'));
        await header!.trigger('click');
        expect(wrapper.text()).not.toContain('Alice');
        await header!.trigger('click');
        expect(wrapper.text()).toContain('Alice');
    });
});

describe('OnlineUsersSidebar profile + DM', () => {
    it('opens the user profile panel when a member is clicked', async () => {
        const users = useUsersStore();
        users.upsert({ id: '1', username: 'a', display_name: 'Alice', status: 'online' });
        const wrapper = mountSidebar();

        expect(wrapper.find('.user-profile-panel').exists()).toBe(false);
        const memberBtn = wrapper.findAll('button').find((b) => b.text().includes('Alice'));
        await memberBtn!.trigger('click');
        expect(wrapper.find('.user-profile-panel').exists()).toBe(true);
    });

    it('starts a DM and navigates when the profile panel requests it', async () => {
        const users = useUsersStore();
        const dmStore = useDirectMessagesStore();
        users.upsert({ id: '1', username: 'a', display_name: 'Alice', status: 'online' });
        vi.spyOn(dmStore, 'startOrGetDm').mockResolvedValue('group-7');
        const wrapper = mountSidebar();

        await wrapper
            .findAll('button')
            .find((b) => b.text().includes('Alice'))!
            .trigger('click');
        await wrapper.find('.profile-send').trigger('click');
        await flushPromises();

        expect(dmStore.startOrGetDm).toHaveBeenCalledWith('1');
        expect(routerPush).toHaveBeenCalledWith({ name: 'direct-messages', params: { threadId: 'group-7' } });
        // Panel closes after starting the DM.
        expect(wrapper.find('.user-profile-panel').exists()).toBe(false);
    });
});
