import { sendDmMessage } from '@/api/direct-messages';
import { sendMessage as apiSendMessage } from '@/api/messages';
import { normalizeMessage } from '@/api/normalizers';
import { useChatStore } from '@/stores/chat';
import { useDirectMessagesStore } from '@/stores/directMessages';
import type { MessageData } from '@/types/chat';

/**
 * Durable outbox for optimistic messages. Persists unconfirmed sends to the
 * main-process SQLite outbox so they survive an app restart/crash, and drives
 * the manual retry of failed sends. See src/main/database.ts for the storage.
 *
 * Retries reuse the original client_temp_id, so the server dedupes them
 * (returns 200 with the already-stored message) and never creates duplicates.
 */

/** Shape persisted per row (JSON columns as strings). Mirrors preload OutboxRow. */
interface StoredOutboxRow {
    client_temp_id: string;
    channel_id: string;
    is_dm: boolean;
    is_thread: boolean;
    thread_message_id: string | null;
    payload: string;
    optimistic: string;
    error: string | null;
    created_at: string;
}

export interface OutboxEntry {
    clientTempId: string;
    channelId: string;
    isDm: boolean;
    /** The exact API request body, re-POSTed verbatim on retry. */
    payload: Record<string, unknown>;
    /** The full optimistic MessageData, used to re-render offline after restart. */
    optimistic: MessageData;
    createdAt: string;
    error?: string | null;
}

const rowCache = new Map<string, StoredOutboxRow>();

function toRow(entry: OutboxEntry): StoredOutboxRow {
    return {
        client_temp_id: entry.clientTempId,
        channel_id: entry.channelId,
        is_dm: entry.isDm,
        is_thread: false,
        thread_message_id: null,
        payload: JSON.stringify(entry.payload),
        optimistic: JSON.stringify(entry.optimistic),
        error: entry.error ?? null,
        created_at: entry.createdAt,
    };
}

function reconcile(
    store: ReturnType<typeof useChatStore | typeof useDirectMessagesStore>,
    clientTempId: string,
    serverMsg: MessageData,
): void {
    const msgs = store.messages;
    const serverIdx = msgs.findIndex((m) => m.id === serverMsg.id);
    const optimisticIdx = msgs.findIndex((m) => m.id === clientTempId);

    if (serverIdx !== -1) {
        if (optimisticIdx !== -1 && optimisticIdx !== serverIdx) {
            msgs.splice(optimisticIdx, 1);
        }
    } else if (optimisticIdx !== -1) {
        msgs.splice(optimisticIdx, 1, serverMsg);
    } else {
        store.addMessage(serverMsg);
    }
}

export function useMessageOutbox() {
    async function enqueue(entry: OutboxEntry): Promise<void> {
        const row = toRow(entry);
        rowCache.set(row.client_temp_id, row);
        await window.api.outbox.enqueue(row);
    }

    async function clear(clientTempId: string): Promise<void> {
        rowCache.delete(clientTempId);
        await window.api.outbox.remove(clientTempId);
    }

    /** Load persisted (failed) messages for a channel, newest last, for merging into the tail. */
    async function loadForChannel(channelId: string, isDm: boolean): Promise<MessageData[]> {
        const rows = await window.api.outbox.listForChannel(channelId, isDm);
        return rows.map((row) => {
            rowCache.set(row.client_temp_id, row);
            const optimistic = JSON.parse(row.optimistic) as MessageData;
            // A persisted row is by definition unconfirmed — always surface it as failed.
            optimistic.send_status = 'failed';
            return optimistic;
        });
    }

    /**
     * Re-POST a failed message with its original client_temp_id. On success the
     * outbox row is deleted and the optimistic message reconciled to the server
     * copy. On failure the message is flipped back to 'failed' and the error
     * re-thrown so the caller can apply rate-limit handling.
     */
    async function retry(clientTempId: string): Promise<void> {
        const row = rowCache.get(clientTempId) ?? (await window.api.outbox.get(clientTempId));
        if (!row) return;
        rowCache.set(clientTempId, row);

        const store = row.is_dm ? useDirectMessagesStore() : useChatStore();
        store.updateMessage(clientTempId, { send_status: 'sending' });

        const data = JSON.parse(row.payload) as Record<string, unknown> & {
            link_preview?: MessageData['link_preview'];
        };

        try {
            const response = row.is_dm
                ? await sendDmMessage(row.channel_id, data as never)
                : await apiSendMessage(row.channel_id, data as never);

            if (response.data) {
                const serverMsg = normalizeMessage(response.data, response.included);
                serverMsg.link_preview = data.link_preview ?? serverMsg.link_preview;
                reconcile(store, clientTempId, serverMsg);
            }
            await clear(clientTempId);
        } catch (error) {
            store.updateMessage(clientTempId, { send_status: 'failed' });
            const message = error instanceof Error ? error.message : String(error);
            await enqueue({
                clientTempId,
                channelId: row.channel_id,
                isDm: row.is_dm,
                payload: JSON.parse(row.payload),
                optimistic: { ...(JSON.parse(row.optimistic) as MessageData), send_status: 'failed' },
                createdAt: row.created_at,
                error: message,
            });
            throw error;
        }
    }

    return { enqueue, clear, loadForChannel, retry };
}
