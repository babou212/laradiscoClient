export const CATEGORY_KEYS = {
    root: ['categories'] as const,
    list: () => [...CATEGORY_KEYS.root, 'list'] as const,
    byId: (id: string) => [...CATEGORY_KEYS.root, id] as const,
};

export const CHANNEL_KEYS = {
    root: ['channels'] as const,
    byId: (id: string) => [...CHANNEL_KEYS.root, id] as const,
    messages: (channelId: string) =>
        [...CHANNEL_KEYS.root, channelId, 'messages'] as const,
    pins: (channelId: string) =>
        [...CHANNEL_KEYS.root, channelId, 'pins'] as const,
};

export const MESSAGE_KEYS = {
    root: ['messages'] as const,
    byChannel: (channelId: string) =>
        [...MESSAGE_KEYS.root, 'channel', channelId] as const,
};

export const DM_KEYS = {
    root: ['direct-messages'] as const,
    groups: () => [...DM_KEYS.root, 'groups'] as const,
    byGroup: (id: string) => [...DM_KEYS.root, 'group', id] as const,
    messages: (groupId: string) =>
        [...DM_KEYS.root, 'group', groupId, 'messages'] as const,
    pins: (groupId: string) =>
        [...DM_KEYS.root, 'group', groupId, 'pins'] as const,
};

export const MEMBER_KEYS = {
    root: ['members'] as const,
    list: () => [...MEMBER_KEYS.root, 'list'] as const,
    search: (query: string) => [...MEMBER_KEYS.root, 'search', query] as const,
};

export const MENTION_KEYS = {
    root: ['mentions'] as const,
    search: (query: string) => [...MENTION_KEYS.root, 'search', query] as const,
};

export const NOTIFICATION_KEYS = {
    root: ['notifications'] as const,
    list: () => [...NOTIFICATION_KEYS.root, 'list'] as const,
};

export const THREAD_KEYS = {
    root: ['threads'] as const,
    byId: (channelId: string, threadId: string) =>
        [...THREAD_KEYS.root, channelId, threadId] as const,
    messages: (channelId: string, threadId: string) =>
        [...THREAD_KEYS.root, channelId, threadId, 'messages'] as const,
};

export const USER_KEYS = {
    root: ['users'] as const,
    byId: (id: string) => [...USER_KEYS.root, id] as const,
};

export const SETTINGS_KEYS = {
    root: ['settings'] as const,
    profile: () => [...SETTINGS_KEYS.root, 'profile'] as const,
    inviteLinks: () => [...SETTINGS_KEYS.root, 'invite-links'] as const,
    roles: () => [...SETTINGS_KEYS.root, 'roles'] as const,
    members: () => [...SETTINGS_KEYS.root, 'members'] as const,
    channels: () => [...SETTINGS_KEYS.root, 'channels'] as const,
};
