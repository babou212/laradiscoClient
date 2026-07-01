import type { Attachment, LinkPreviewData } from '@/types/chat';

const YOUTUBE_URL_PATTERN = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[^\s]+)/;
const YOUTUBE_URL_PATTERN_GLOBAL = /(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)[^\s]+)/g;
const YOUTUBE_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

function extractYouTubeId(url: string): string | null {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
        /youtube\.com\/watch\?.*v=([^&\s?]+)/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

/** The 11-char YouTube video id contained in `content`, or null if none/invalid. */
export function youtubeVideoId(content: string): string | null {
    const match = content.match(YOUTUBE_URL_PATTERN);
    if (!match) return null;
    const id = extractYouTubeId(match[1]);
    return id && YOUTUBE_ID_REGEX.test(id) ? id : null;
}

export function youtubeWatchUrl(videoId: string): string {
    return `https://www.youtube.com/watch?v=${videoId}`;
}

export function youtubeEmbedUrl(videoId: string): string {
    return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&origin=https://www.youtube-nocookie.com`;
}

/** `content` with any YouTube watch URLs stripped out. */
export function stripYoutubeUrl(content: string): string {
    return content.replace(YOUTUBE_URL_PATTERN_GLOBAL, '').trim();
}

export function isGifUrl(content: string): boolean {
    return (
        /^https?:\/\/.*\.gif$/i.test(content) ||
        content.includes('tenor.com') ||
        content.includes('media.tenor.com')
    );
}

/** `content` with the link-preview URL removed (it is shown inside the card). */
export function stripPreviewUrl(content: string, linkPreview: LinkPreviewData | null): string {
    if (!linkPreview) return content;
    return content.split(linkPreview.url).join('').replace(/\s+/g, ' ').trim();
}

/**
 * Attachments to render as standalone tiles, excluding the link-preview image
 * (already displayed inside the preview card).
 */
export function visibleAttachments(
    attachments: Attachment[] | undefined,
    linkPreview: LinkPreviewData | null,
): Attachment[] {
    if (!attachments?.length) return [];
    const previewImageId = linkPreview?.image?.id;
    if (!previewImageId) return attachments;
    return attachments.filter((att) => att.id !== previewImageId);
}
