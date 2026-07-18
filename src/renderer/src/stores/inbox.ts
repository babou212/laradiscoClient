import { acceptHMRUpdate, defineStore } from 'pinia';
import { ackInbox, getInbox, type InboxAckItem } from '@/api/inbox';
import { coerceBroadcastMessage } from '@/api/normalizers';
import { useChatStore } from './chat';
import { useDirectMessagesStore } from './directMessages';

/**
 * Offline-delivery inbox. When the websocket (re)connects, drain() pulls any
 * messages the server buffered while we were offline (DMs and @mentions),
 * applies them to local state, then acks so the server deletes them.
 *
 * Online clients normally ack each message live via the notifications channel
 * (see stores/notifications.ts), so by the time we drain there is usually
 * nothing left — drain is the catch-up path for messages missed while away.
 */
export const useInboxStore = defineStore('inbox', () => {
    // Guard against overlapping/duplicate drains (reconnect storms fire the
    // websocket 'connected' event repeatedly).
    let draining = false;

    async function drain(): Promise<void> {
        if (draining) return;
        draining = true;
        try {
            const { data } = await getInbox();
            if (!data.length) return;

            const chat = useChatStore();
            const dm = useDirectMessagesStore();
            let dmApplied = false;
            const acked: InboxAckItem[] = [];

            for (const item of data) {
                const payload = item.payload;
                // Coerce numeric broadcast IDs to strings in place (channel_id /
                // dm_group_id are inbox-only fields preserved on `payload`).
                coerceBroadcastMessage(payload);

                if (item.message_type === 'channel' && payload.channel_id != null) {
                    const channelId = String(payload.channel_id);
                    // Splice into the open channel only when anchored to the live
                    // tail; otherwise just flag unread (the message loads on open).
                    if (chat.selectedChannelId === channelId && !chat.isViewingHistory) {
                        chat.addMessage(payload);
                    } else {
                        chat.setChannelUnread(channelId, true);
                    }
                } else if (item.message_type === 'direct_message' && payload.dm_group_id != null) {
                    const groupId = String(payload.dm_group_id);

                    if (payload.message_bytes) {
                        payload.content =
                            (await window.api.mls.decryptDm(
                                Number(payload.dm_group_id),
                                String(payload.id),
                                payload.message_bytes,
                            )) ?? '[unable to decrypt]';
                    }
                    if (dm.selectedDmGroupId === groupId && !dm.isViewingHistory) {
                        dm.addMessage(payload);
                    }
                    dmApplied = true;
                }

                acked.push({ message_type: item.message_type, message_id: item.message_id });
            }

            // Refresh the DM sidebar so last-message previews/ordering reflect
            // anything delivered to conversations we don't currently have open.
            if (dmApplied) {
                void dm.fetchDmGroups();
            }

            if (acked.length) {
                await ackInbox(acked);
            }
        } catch (error) {
            console.error('[Inbox] drain failed:', error);
        } finally {
            draining = false;
        }
    }

    return { drain };
});

if (import.meta.hot) {
    import.meta.hot.accept(acceptHMRUpdate(useInboxStore, import.meta.hot));
}
