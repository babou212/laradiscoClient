import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth';
import type { DmGroup } from '@/stores/directMessages';
import { usePresenceStore } from '@/stores/presence';
import { useUsersStore } from '@/stores/users';
import type { Category } from '@/types/chat';
import ChannelSidebar from './ChannelSidebar.vue';

vi.mock('@/lib/echo', async () => (await import('@/../../../test/helpers/echo')).echoMockFactory());
vi.mock('@/api/presence', () => ({ updatePresence: vi.fn() }));

const routerPush = vi.fn();
vi.mock('vue-router', () => ({ useRouter: () => ({ push: routerPush }) }));

const stubs = {
    VoiceChannelItem: {
        name: 'VoiceChannelItem',
        props: ['channel'],
        template: '<div class="voice-channel-item"><slot /></div>',
    },
    VoiceControlPanel: { template: '<div class="voice-control-panel"><slot /></div>' },
    Avatar: { template: '<div><slot /></div>' },
    AvatarImage: { template: '<div><slot /></div>' },
    AvatarFallback: { template: '<div><slot /></div>' },
};

function channel(id: string, name: string, extra: Record<string, unknown> = {}) {
    return { id, name, topic: null, type: 'text', ...extra };
}

function category(id: string, name: string, channels: ReturnType<typeof channel>[]): Category {
    return { id, name, position: 0, channels } as Category;
}

function mountSidebar(
    props: Partial<{ categories: Category[]; directMessages: DmGroup[]; selectedChannelId: string }> = {},
) {
    return mount(ChannelSidebar, {
        props: {
            categories: props.categories ?? [],
            directMessages: props.directMessages ?? [],
            selectedChannelId: props.selectedChannelId,
        },
        global: { stubs },
    });
}

beforeEach(() => {
    routerPush.mockReset();
});

describe('ChannelSidebar rendering', () => {
    it('renders categories and their text channels', () => {
        const wrapper = mountSidebar({
            categories: [category('c1', 'General', [channel('10', 'welcome'), channel('11', 'random')])],
        });
        expect(wrapper.text()).toContain('General');
        expect(wrapper.text()).toContain('welcome');
        expect(wrapper.text()).toContain('random');
    });

    it('routes voice channels to VoiceChannelItem and keeps them out of the text list', () => {
        const wrapper = mountSidebar({
            categories: [
                category('c1', 'General', [channel('10', 'welcome'), channel('20', 'Lounge', { type: 'voice' })]),
            ],
        });
        const voiceItems = wrapper.findAllComponents({ name: 'VoiceChannelItem' });
        expect(voiceItems).toHaveLength(1);
        expect(voiceItems[0].props('channel')).toMatchObject({ id: '20', name: 'Lounge' });
        // The voice channel is not rendered as a clickable text channel button.
        const textChannelButtons = wrapper.findAll('button').filter((b) => b.text().includes('Lounge'));
        expect(textChannelButtons).toHaveLength(0);
    });
});

describe('ChannelSidebar interaction', () => {
    it('emits selectChannel with the channel id when a channel is clicked', async () => {
        const wrapper = mountSidebar({
            categories: [category('c1', 'General', [channel('10', 'welcome')])],
        });
        const btn = wrapper.findAll('button').find((b) => b.text().includes('welcome'));
        await btn!.trigger('click');
        expect(wrapper.emitted('selectChannel')?.[0]).toEqual(['10']);
    });

    it('emits switchToDms when the Direct Messages button is clicked', async () => {
        const wrapper = mountSidebar();
        const btn = wrapper.findAll('button').find((b) => b.text().includes('Direct Messages'));
        await btn!.trigger('click');
        expect(wrapper.emitted('switchToDms')).toBeTruthy();
    });

    it('collapses a category, hiding its channels, then expands it again', async () => {
        const wrapper = mountSidebar({
            categories: [category('c1', 'General', [channel('10', 'welcome')])],
        });
        const header = wrapper.findAll('button').find((b) => b.text().includes('General'));
        await header!.trigger('click');
        expect(wrapper.text()).not.toContain('welcome');
        await header!.trigger('click');
        expect(wrapper.text()).toContain('welcome');
    });
});

describe('ChannelSidebar selected / unread state', () => {
    it('highlights the selected channel', () => {
        const wrapper = mountSidebar({
            categories: [category('c1', 'General', [channel('10', 'welcome')])],
            selectedChannelId: '10',
        });
        const btn = wrapper.findAll('button').find((b) => b.text().includes('welcome'));
        expect(btn!.classes()).toContain('bg-sidebar-accent');
    });

    it('marks an unread (non-selected) channel as bold/highlighted', () => {
        const wrapper = mountSidebar({
            categories: [category('c1', 'General', [channel('10', 'welcome', { has_unread: true })])],
        });
        const btn = wrapper.findAll('button').find((b) => b.text().includes('welcome'));
        expect(btn!.classes()).toContain('font-semibold');
    });
});

describe('ChannelSidebar user footer', () => {
    it('shows the authenticated user display name and toggles the status popup', async () => {
        const auth = useAuthStore();
        const users = useUsersStore();
        users.upsert({ id: 'me', username: 'alice', display_name: 'Alice A' });
        auth.user = { id: 'me', username: 'alice', email: 'a@x.com', avatar_urls: null } as never;

        const wrapper = mountSidebar();
        expect(wrapper.text()).toContain('Alice A');
        // Status options are hidden until the footer is clicked.
        expect(wrapper.text()).not.toContain('Invisible');

        const footer = wrapper.findAll('button').find((b) => b.text().includes('Alice A'));
        await footer!.trigger('click');
        expect(wrapper.text()).toContain('Invisible');
    });

    it('updates presence in the store when a status option is chosen', async () => {
        const auth = useAuthStore();
        const users = useUsersStore();
        const presence = usePresenceStore();
        users.upsert({ id: 'me', username: 'alice', display_name: 'Alice A' });
        auth.user = { id: 'me', username: 'alice', email: 'a@x.com', avatar_urls: null } as never;
        const spy = vi.spyOn(presence, 'updateUserStatus');

        const wrapper = mountSidebar();
        await wrapper
            .findAll('button')
            .find((b) => b.text().includes('Alice A'))!
            .trigger('click');
        await wrapper
            .findAll('button')
            .find((b) => b.text().includes('Do Not Disturb'))!
            .trigger('click');

        expect(spy).toHaveBeenCalledWith('me', 'dnd', null);
    });

    it('logs out and navigates to login', async () => {
        const auth = useAuthStore();
        const users = useUsersStore();
        users.upsert({ id: 'me', username: 'alice', display_name: 'Alice A' });
        auth.user = { id: 'me', username: 'alice', email: 'a@x.com', avatar_urls: null } as never;
        const logoutSpy = vi.spyOn(auth, 'logout').mockResolvedValue();

        const wrapper = mountSidebar();
        await wrapper
            .findAll('button')
            .find((b) => b.text().includes('Alice A'))!
            .trigger('click');
        await wrapper
            .findAll('button')
            .find((b) => b.text().includes('Logout'))!
            .trigger('click');
        await Promise.resolve();

        expect(logoutSpy).toHaveBeenCalled();
        expect(routerPush).toHaveBeenCalledWith({ name: 'login' });
    });
});
