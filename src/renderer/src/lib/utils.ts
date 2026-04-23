import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { twMerge } from 'tailwind-merge';
import { currentDateFnsLocale, t } from '@/i18n';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

function localTz(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function toDate(value: unknown): Date | null {
    if (value == null || value === '') return null;
    let d: Date;
    if (typeof value === 'number') {
        d = new Date(value < 10000000000 ? value * 1000 : value);
    } else if (typeof value === 'string') {
        d = parseISO(value);
        if (isNaN(d.getTime())) d = new Date(value);
    } else if (value instanceof Date) {
        d = value;
    } else {
        d = new Date(value as string | number);
    }
    return isNaN(d.getTime()) ? null : d;
}

export function formatMessageDate(dateValue: unknown): string {
    const date = toDate(dateValue);
    if (!date) return '';

    try {
        const zoned = toZonedTime(date, localTz());
        const locale = currentDateFnsLocale.value;

        if (isToday(zoned)) {
            return t('dates.todayAt', { time: format(zoned, 'h:mm a', { locale }) });
        }

        if (isYesterday(zoned)) {
            return t('dates.yesterdayAt', { time: format(zoned, 'h:mm a', { locale }) });
        }

        return format(zoned, 'MM/dd/yyyy', { locale });
    } catch {
        return '';
    }
}

export function formatLocalizedDate(value: unknown, fmt = 'PP'): string {
    const date = toDate(value);
    if (!date) return '';
    try {
        return format(toZonedTime(date, localTz()), fmt, { locale: currentDateFnsLocale.value });
    } catch {
        return '';
    }
}

export function formatLocalizedDateTime(value: unknown, fmt = 'PP p'): string {
    return formatLocalizedDate(value, fmt);
}
