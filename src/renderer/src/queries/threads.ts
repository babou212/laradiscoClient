import { defineQueryOptions } from '@pinia/colada';
import { THREAD_KEYS } from './keys';
import { getThread, getThreadMessages } from '@/api/threads';

export const threadQuery = defineQueryOptions((params: { channelId: string; threadId: string }) => ({
    key: THREAD_KEYS.byId(params.channelId, params.threadId),
    query: () => getThread(params.channelId, params.threadId),
}));

export const threadMessagesQuery = defineQueryOptions((params: { channelId: string; threadId: string }) => ({
    key: THREAD_KEYS.messages(params.channelId, params.threadId),
    query: () => getThreadMessages(params.channelId, params.threadId),
}));
