import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { twMerge } from 'tailwind-merge';
import { currentDateFnsLocale, t } from '@/i18n';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatMessageDate(dateValue: unknown): string {
    if (!dateValue) return '';

    try {
        let date: Date;

        if (typeof dateValue === 'number') {
            date = new Date(dateValue < 10000000000 ? dateValue * 1000 : dateValue);
        } else {
            date = typeof dateValue === 'string' ? parseISO(dateValue) : new Date(dateValue as string | number);

            if (isNaN(date.getTime())) {
                date = new Date(dateValue as string | number);
            }
        }

        if (isNaN(date.getTime())) {
            return '';
        }

        const locale = currentDateFnsLocale.value;

        if (isToday(date)) {
            return t('dates.todayAt', { time: format(date, 'h:mm a', { locale }) });
        }

        if (isYesterday(date)) {
            return t('dates.yesterdayAt', { time: format(date, 'h:mm a', { locale }) });
        }

        return format(date, 'MM/dd/yyyy', { locale });
    } catch {
        return '';
    }
}
