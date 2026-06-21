import { defineQueryOptions } from '@pinia/colada';
import { getNotifications } from '@/api/notifications';
import { NOTIFICATION_KEYS } from './keys';

export const notificationsQuery = defineQueryOptions({
    key: NOTIFICATION_KEYS.list(),
    query: () => getNotifications(),
});
