import type { LinkPreviewData } from '@/types/chat';

const URL_REGEX = /https?:\/\/[^\s<>"'`]+/gi;
const MAX_LENGTH = 80;

function hostnameOf(url: string): string | null {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch {
        return null;
    }
}

function labelForUrl(url: string, linkPreview: LinkPreviewData | null | undefined): string {
    if (linkPreview?.url === url && linkPreview.title) {
        return linkPreview.title;
    }
    const host = hostnameOf(url);
    return host ?? 'link';
}

export function formatReplyPreview(content: string, linkPreview?: LinkPreviewData | null): string {
    const collapsed = content.replace(/\s+/g, ' ').trim();
    if (!collapsed) return 'See attachment';

    const urlMatches = collapsed.match(URL_REGEX) ?? [];
    let result = collapsed;
    for (const url of urlMatches) {
        result = result.split(url).join(labelForUrl(url, linkPreview));
    }

    if (result.length > MAX_LENGTH) {
        result = `${result.slice(0, MAX_LENGTH - 1).trimEnd()}…`;
    }
    return result;
}
