const URL_REGEX = /https:\/\/[^\s<>"'`]+/gi;

const SKIP_HOSTS = [
    'youtube.com',
    'www.youtube.com',
    'youtu.be',
    'm.youtube.com',
    'tenor.com',
    'media.tenor.com',
    'giphy.com',
    'media.giphy.com',
];

const TRAILING_PUNCTUATION = /[.,!?;:)\]}'"]+$/;

function stripTrailing(url: string): string {
    return url.replace(TRAILING_PUNCTUATION, '');
}

export function extractFirstPreviewUrl(content: string): string | null {
    const matches = content.match(URL_REGEX);
    if (!matches) return null;

    for (const raw of matches) {
        const cleaned = stripTrailing(raw);
        let parsed: URL;
        try {
            parsed = new URL(cleaned);
        } catch {
            continue;
        }

        if (parsed.protocol !== 'https:') continue;

        const host = parsed.hostname.toLowerCase();
        if (SKIP_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) continue;

        if (/\.(gif|png|jpg|jpeg|webp|svg)$/i.test(parsed.pathname)) continue;

        return cleaned;
    }

    return null;
}
