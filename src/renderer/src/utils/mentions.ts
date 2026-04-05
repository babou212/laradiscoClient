import { usePresenceStore } from '@/stores/presence';

export function extractMentionMetadata(content: string): {
    userIds: number[];
    mentionEveryone: boolean;
    mentionHere: boolean;
} {
    const mentionEveryone = /@everyone\b/.test(content);
    const mentionHere = /@here\b/.test(content);

    const presenceStore = usePresenceStore();
    const userIds: number[] = [];
    const matches = content.matchAll(/@(\w+)/g);
    for (const match of matches) {
        const name = match[1];
        if (name === 'everyone' || name === 'here') continue;
        const member = presenceStore.allMembers.find((m) => m.username?.toLowerCase() === name.toLowerCase());
        if (member) {
            userIds.push(Number(member.id));
        }
    }

    return { userIds: [...new Set(userIds)], mentionEveryone, mentionHere };
}
