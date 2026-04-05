import { defineQueryOptions } from '@pinia/colada';
import { NOTIFICATION_KEYS } from './keys';
import { getNotifications } from '@/api/notifications';

export const notificationsQuery = defineQueryOptions({
    key: NOTIFICATION_KEYS.list(),
    query: () => getNotifications(),
});
