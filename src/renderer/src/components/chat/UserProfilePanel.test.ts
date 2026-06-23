import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUsersStore } from '@/stores/users';
import type { OnlineUser, UserActivity } from '@/types/user';
import UserProfilePanel from './UserProfilePanel.vue';

// Keep the watch's immediate fetch off the real network in cases that clear the store.
vi.mock('@/api/users', () => ({ getUserProfile: vi.fn(() => new Promise(() => {})) }));

const stubs = {
    UserActivityCard: { template: '<div class="activity-card">activity</div>' },
};

function user(overrides: Partial<OnlineUser> = {}): OnlineUser {
    return {
        id: '7',
        username: 'alice',
        display_name: 'Alice',
        avatar_urls: null,
        custom_status: null,
        status: 'online',
        activity: null,
        ...overrides,
    };
}

function mountPanel(props: Partial<{ user: OnlineUser | null; show: boolean; isCurrentUser: boolean }> = {}) {
    return mount(UserProfilePanel, {
        props: {
            user: props.user === undefined ? user() : props.user,
            show: props.show ?? true,
            isCurrentUser: props.isCurrentUser,
        },
        global: { stubs },
    });
}

beforeEach(() => {
    // Seed the user as already-fetched so the watch doesn't fire a network fetch.
    useUsersStore().upsert({ id: '7', username: 'alice', display_name: 'Alice', created_at: '2024-01-15T00:00:00Z' });
});

describe('UserProfilePanel visibility', () => {
    it('renders nothing when show is false', () => {
        expect(mountPanel({ show: false }).text()).toBe('');
    });

    it('renders nothing when there is no user', () => {
        expect(mountPanel({ user: null }).text()).toBe('');
    });

    it('renders the panel when shown with a user', () => {
        expect(mountPanel().text()).toContain('Alice');
    });
});

describe('UserProfilePanel profile fields', () => {
    it('shows the display name from the store', () => {
        const store = useUsersStore();
        store.upsert({ id: '7', display_name: 'Alice Wonderland' });
        expect(mountPanel().text()).toContain('Alice Wonderland');
    });

    it('shows the custom status when set', () => {
        expect(mountPanel({ user: user({ custom_status: 'Coding away' }) }).text()).toContain('Coding away');
    });

    it('shows the status label', () => {
        expect(mountPanel({ user: user({ status: 'dnd' }) }).text()).toContain('Do Not Disturb');
    });

    it('renders the member-since date', () => {
        // Seeded created_at is 2024-01-15 -> formatLocalizedDate 'PP'
        expect(mountPanel().text()).toContain('Jan 15, 2024');
    });

    it('falls back to unknown member-since when there is no created_at', () => {
        const store = useUsersStore();
        store.byId.clear();
        store.upsert({ id: '7', username: 'alice', display_name: 'Alice' });
        const wrapper = mountPanel();
        expect(wrapper.text()).toContain('Member Since');
        expect(wrapper.text()).toContain('Unknown');
    });
});

describe('UserProfilePanel roles', () => {
    it('renders role chips when the user has roles', () => {
        const store = useUsersStore();
        store.upsert({
            id: '7',
            roles: [{ id: 'r1', name: 'Admin', color: '#ff0000', position: 1 }],
        });
        const wrapper = mountPanel();
        expect(wrapper.text()).toContain('Roles');
        expect(wrapper.text()).toContain('Admin');
    });

    it('omits the roles section when there are no roles', () => {
        expect(mountPanel().text()).not.toContain('Roles');
    });
});

describe('UserProfilePanel activity', () => {
    it('renders the activity card when the user has an activity', () => {
        const activity: UserActivity = {
            type: 'game',
            name: 'Chess',
            application_id: 'a1',
            started_at: 0,
        };
        const store = useUsersStore();
        store.upsert({ id: '7', activity });
        expect(mountPanel().find('.activity-card').exists()).toBe(true);
    });

    it('omits the activity card when there is no activity', () => {
        expect(mountPanel().find('.activity-card').exists()).toBe(false);
    });
});

describe('UserProfilePanel actions', () => {
    it('shows the send-message button for other users and emits with the user id', async () => {
        const wrapper = mountPanel({ isCurrentUser: false });
        const button = wrapper.findAll('button').find((b) => b.text().includes('Send Message'));
        expect(button).toBeTruthy();
        await button!.trigger('click');
        expect(wrapper.emitted('sendMessage')?.[0]).toEqual(['7']);
    });

    it('hides the send-message button for the current user', () => {
        const wrapper = mountPanel({ isCurrentUser: true });
        expect(wrapper.findAll('button').find((b) => b.text().includes('Send Message'))).toBeUndefined();
    });

    it('emits close when the backdrop is clicked', async () => {
        const wrapper = mountPanel();
        await wrapper.find('.fixed.inset-0').trigger('click');
        expect(wrapper.emitted('close')).toBeTruthy();
    });
});

describe('UserProfilePanel fetching', () => {
    it('fetches the profile when shown and the user is not yet cached', () => {
        const store = useUsersStore();
        store.byId.clear();
        const fetchSpy = vi.spyOn(store, 'fetch').mockResolvedValue(null);
        mountPanel();
        expect(fetchSpy).toHaveBeenCalledWith('7');
    });

    it('does not fetch when the user is already fully cached', () => {
        const store = useUsersStore();
        const fetchSpy = vi.spyOn(store, 'fetch').mockResolvedValue(null);
        mountPanel();
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});
