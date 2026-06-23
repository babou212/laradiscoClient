import { lookup } from 'dns/promises';
import ipaddr from 'ipaddr.js';
import { normalizeUrl } from './urlNormalize';

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const IMAGE_FETCH_TIMEOUT_MS = 4000;
const MAX_REDIRECTS = 5;
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0';

export interface LinkPreviewMetadata {
    url: string;
    title: string;
    description?: string;
    site_name?: string;
    image_url?: string;
}

export interface UnfurlSuccess {
    status: 'ok';
    metadata: LinkPreviewMetadata;
    imageBytes?: Buffer;
    imageMime?: string;
    imageWidth?: number;
    imageHeight?: number;
}

export interface UnfurlFailure {
    status: 'failed' | 'blocked';
    error: string;
}

export type UnfurlResult = UnfurlSuccess | UnfurlFailure;

export function isPublicIp(ip: string): boolean {
    if (!ipaddr.isValid(ip)) return false;
    const addr = ipaddr.parse(ip);
    const range = addr.range();

    if (addr.kind() === 'ipv4') {
        return range === 'unicast';
    }

    return range === 'unicast';
}

export async function assertPublicHostname(hostname: string): Promise<void> {
    const lower = hostname.toLowerCase();
    if (
        lower === 'localhost' ||
        lower.endsWith('.local') ||
        lower.endsWith('.internal') ||
        lower.endsWith('.localhost') ||
        lower.endsWith('.test') ||
        lower.endsWith('.example') ||
        lower.endsWith('.invalid')
    ) {
        throw new Error(`Blocked hostname: ${hostname}`);
    }

    if (ipaddr.isValid(lower)) {
        if (!isPublicIp(lower)) {
            throw new Error(`Blocked IP literal: ${hostname}`);
        }
        return;
    }

    const results = await lookup(hostname, { all: true, verbatim: true });
    if (results.length === 0) {
        throw new Error(`DNS resolution returned no addresses for ${hostname}`);
    }
    for (const r of results) {
        if (!isPublicIp(r.address)) {
            throw new Error(`Blocked resolved IP ${r.address} for ${hostname}`);
        }
    }
}

function assertHttpsUrl(raw: string): URL {
    let u: URL;
    try {
        u = new URL(raw);
    } catch {
        throw new Error('Invalid URL');
    }
    if (u.protocol !== 'https:') {
        throw new Error(`Blocked scheme: ${u.protocol}`);
    }
    if (u.username || u.password) {
        throw new Error('URL credentials not allowed');
    }
    return u;
}

function upgradeToHttps(rawUrl: string): string {
    try {
        const u = new URL(rawUrl);
        if (u.protocol === 'http:') {
            u.protocol = 'https:';
            return u.toString();
        }
        return rawUrl;
    } catch {
        return rawUrl;
    }
}

interface FetchResult {
    finalUrl: string;
    contentType: string;
    body: Buffer;
}

async function hardenedFetch(
    startUrl: string,
    accept: string,
    maxBytes: number,
    signal: AbortSignal,
    referer?: string,
): Promise<FetchResult> {
    let currentUrl = startUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const u = assertHttpsUrl(currentUrl);
        await assertPublicHostname(u.hostname);

        const headers: Record<string, string> = {
            'User-Agent': USER_AGENT,
            Accept: accept,
            'Accept-Language': 'en-US,en;q=0.9',
        };
        if (referer) headers.Referer = referer;

        const response = await fetch(currentUrl, {
            method: 'GET',
            redirect: 'manual',
            signal,
            headers,
        });

        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (!location) throw new Error(`Redirect ${response.status} with no Location header`);
            currentUrl = upgradeToHttps(new URL(location, currentUrl).toString());
            continue;
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const contentType = response.headers.get('content-type') ?? '';
        const contentLength = Number(response.headers.get('content-length') ?? '0');
        if (contentLength > maxBytes) {
            throw new Error(`Content-Length ${contentLength} exceeds limit ${maxBytes}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const chunks: Uint8Array[] = [];
        let total = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                total += value.length;
                if (total > maxBytes) {
                    await reader.cancel();
                    throw new Error(`Body exceeds limit ${maxBytes}`);
                }
                chunks.push(value);
            }
        }

        return {
            finalUrl: currentUrl,
            contentType,
            body: Buffer.concat(chunks, total),
        };
    }
    throw new Error(`Too many redirects (> ${MAX_REDIRECTS})`);
}

export function decodeHtmlEntities(input: string): string {
    return input
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');
}

export function extractCharset(contentType: string, html: Buffer): string {
    const ctMatch = contentType.match(/charset=([^;]+)/i);
    if (ctMatch) return ctMatch[1].trim().toLowerCase();
    const head = html.subarray(0, Math.min(html.length, 4096)).toString('ascii');
    const metaCharset = head.match(/<meta[^>]+charset=["']?([a-zA-Z0-9_-]+)/i);
    if (metaCharset) return metaCharset[1].toLowerCase();
    return 'utf-8';
}

function decodeHtml(body: Buffer, contentType: string): string {
    const charset = extractCharset(contentType, body);
    try {
        return new TextDecoder(charset, { fatal: false }).decode(body);
    } catch {
        return new TextDecoder('utf-8', { fatal: false }).decode(body);
    }
}

export function parseMetaTags(html: string): Map<string, string> {
    const result = new Map<string, string>();
    const metaRegex = /<meta\b[^>]*>/gi;
    for (const match of html.matchAll(metaRegex)) {
        const tag = match[0];
        const keyMatch =
            tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i) ??
            tag.match(/\b(?:property|name)\s*=\s*([^\s>]+)/i);
        const contentMatch = tag.match(/\bcontent\s*=\s*"([^"]*)"/i) ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i);
        if (!keyMatch || !contentMatch) continue;
        const key = keyMatch[1].toLowerCase();
        if (!result.has(key)) {
            result.set(key, decodeHtmlEntities(contentMatch[1]).trim());
        }
    }
    return result;
}

export function extractTitle(html: string): string | undefined {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!match) return undefined;
    return decodeHtmlEntities(match[1]).trim().replace(/\s+/g, ' ');
}

export function parseOgMetadata(html: string, finalUrl: string): LinkPreviewMetadata {
    const meta = parseMetaTags(html);
    const title = meta.get('og:title') ?? meta.get('twitter:title') ?? extractTitle(html) ?? new URL(finalUrl).hostname;
    const description =
        meta.get('og:description') ?? meta.get('twitter:description') ?? meta.get('description') ?? undefined;
    const siteName = meta.get('og:site_name') ?? undefined;
    const rawImage = meta.get('og:image') ?? meta.get('og:image:url') ?? meta.get('twitter:image') ?? undefined;
    let imageUrl: string | undefined;
    if (rawImage) {
        try {
            imageUrl = new URL(rawImage, finalUrl).toString();
        } catch {
            imageUrl = undefined;
        }
    }
    return {
        url: finalUrl,
        title: title.slice(0, 300),
        description: description?.slice(0, 600),
        site_name: siteName?.slice(0, 100),
        image_url: imageUrl,
    };
}

function rewriteForFetch(rawUrl: string): string {
    try {
        const u = new URL(rawUrl);
        const host = u.hostname.toLowerCase();
        if (host === 'reddit.com' || host === 'www.reddit.com' || host === 'np.reddit.com') {
            u.hostname = 'old.reddit.com';
            return u.toString();
        }
        return rawUrl;
    } catch {
        return rawUrl;
    }
}

function extractFallbackImageUrl(html: string): string | undefined {
    const patterns = [/https:\/\/i\.redd\.it\/[a-zA-Z0-9]+\.\w+/i, /https:\/\/i\.imgur\.com\/[a-zA-Z0-9]+\.\w+/i];
    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) return match[0];
    }
    return undefined;
}

const VERIFICATION_TITLE_PATTERNS = [
    /please wait.*verification/i,
    /just a moment\.\.\./i,
    /attention required/i,
    /access denied/i,
];

export function looksLikeAntiBot(title: string): boolean {
    return VERIFICATION_TITLE_PATTERNS.some((re) => re.test(title));
}

function isRedditUrl(rawUrl: string): boolean {
    try {
        const host = new URL(rawUrl).hostname.toLowerCase();
        return host === 'reddit.com' || host.endsWith('.reddit.com');
    } catch {
        return false;
    }
}

export function toRedditJsonUrl(rawUrl: string): string | null {
    try {
        const u = new URL(rawUrl);
        // Gallery links (reddit.com/gallery/<id>) and comment permalinks
        // (reddit.com/r/<sub>/comments/<id>/...) both expose the post as JSON at
        // the canonical /comments/<id>.json endpoint. Resolve to that so gallery
        // posts — whose images live in gallery_data/media_metadata rather than as
        // an og:image — are unfurled correctly. old.reddit.com does not render
        // new-style galleries, so use www.reddit.com for the JSON request.
        const postIdMatch = u.pathname.match(/\/(?:gallery|comments)\/([a-z0-9]+)/i);
        if (postIdMatch) {
            return `https://www.reddit.com/comments/${postIdMatch[1]}.json?raw_json=1`;
        }
        u.hostname = 'www.reddit.com';
        u.pathname = u.pathname.replace(/\/+$/, '') + '.json';
        u.search = 'raw_json=1';
        return u.toString();
    } catch {
        return null;
    }
}

async function fetchRedditJsonImages(rawUrl: string, signal: AbortSignal): Promise<string[]> {
    const jsonUrl = toRedditJsonUrl(rawUrl);
    if (!jsonUrl) return [];
    console.info('[unfurl] reddit json fetch:', jsonUrl);
    try {
        const result = await hardenedFetch(jsonUrl, 'application/json', MAX_HTML_BYTES, signal);
        console.info('[unfurl] reddit json ok:', result.contentType, `${result.body.length}b`);
        const parsed = JSON.parse(result.body.toString('utf-8')) as unknown;
        if (!Array.isArray(parsed) || parsed.length === 0) return [];
        const listing = parsed[0] as { data?: { children?: Array<{ data?: Record<string, unknown> }> } };
        const post = listing?.data?.children?.[0]?.data;
        if (!post || typeof post !== 'object') return [];

        const urls: string[] = [];
        const push = (v: unknown) => {
            if (typeof v === 'string' && /^https:\/\//i.test(v)) {
                urls.push(decodeHtmlEntities(v));
            }
        };

        const p = post as {
            preview?: {
                images?: Array<{ source?: { url?: string }; variants?: Record<string, { source?: { url?: string } }> }>;
            };
            media_metadata?: Record<string, { s?: { u?: string; gif?: string; mp4?: string } }>;
            gallery_data?: { items?: Array<{ media_id?: string }> };
            url_overridden_by_dest?: string;
            url?: string;
            thumbnail?: string;
        };

        if (p.gallery_data?.items && p.media_metadata) {
            for (const item of p.gallery_data.items) {
                if (!item.media_id) continue;
                const meta = p.media_metadata[item.media_id];
                push(meta?.s?.u);
                push(meta?.s?.gif);
            }
        }

        if (p.preview?.images) {
            for (const img of p.preview.images) {
                push(img?.source?.url);
            }
        }

        push(p.url_overridden_by_dest);
        push(p.url);
        push(p.thumbnail);

        const seen = new Set<string>();
        return urls.filter((u) => {
            if (seen.has(u)) return false;
            seen.add(u);
            return true;
        });
    } catch (err) {
        console.warn('[unfurl] reddit json fallback failed:', err instanceof Error ? err.message : err);
        return [];
    }
}

const EXT_MIME_MAP: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    svg: 'image/svg+xml',
};

function resolveImageMime(contentType: string, imageUrl: string): string {
    let mime = contentType.split(';')[0].trim().toLowerCase();
    if (!mime) {
        const ext = new URL(imageUrl).pathname.match(/\.(jpe?g|png|gif|webp|avif|svg)$/i)?.[1]?.toLowerCase();
        mime = ext ? (EXT_MIME_MAP[ext] ?? '') : '';
    }
    return mime;
}

function getImageCandidates(html: string, finalUrl: string, meta: LinkPreviewMetadata): string[] {
    const tags = parseMetaTags(html);
    const ordered: (string | undefined)[] = [
        meta.image_url,
        tags.get('og:image:secure_url'),
        tags.get('og:image:url'),
        tags.get('twitter:image:src'),
        tags.get('twitter:image'),
    ];
    const linkMatch = html.match(/<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i);
    if (linkMatch) ordered.push(linkMatch[1]);
    const fallback = extractFallbackImageUrl(html);
    if (fallback) ordered.push(fallback);

    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of ordered) {
        if (!raw) continue;
        try {
            const abs = new URL(raw, finalUrl).toString();
            const https = upgradeToHttps(abs);
            if (!seen.has(https)) {
                seen.add(https);
                result.push(https);
            }
        } catch {
            /* skip */
        }
    }
    return result;
}

async function raceImageFetch(
    candidates: string[],
    referer: string,
    signal: AbortSignal,
): Promise<{ bytes: Buffer; mime: string; url: string } | null> {
    if (candidates.length === 0) return null;
    const attempts: { url: string; referer: string | undefined }[] = [];
    for (const url of candidates.slice(0, 3)) {
        attempts.push({ url, referer });
        attempts.push({ url, referer: undefined });
    }

    const controllers = attempts.map(() => new AbortController());
    const onOuterAbort = () => controllers.forEach((c) => c.abort());
    signal.addEventListener('abort', onOuterAbort, { once: true });

    const promises = attempts.map(async (a, i) => {
        try {
            const result = await hardenedFetch(a.url, 'image/*', MAX_IMAGE_BYTES, controllers[i].signal, a.referer);
            const mime = resolveImageMime(result.contentType, a.url);
            if (!mime.startsWith('image/')) {
                throw new Error(`non-image mime: ${mime}`);
            }
            return { bytes: result.body, mime, url: a.url, index: i };
        } catch (err) {
            console.warn(
                `[unfurl] image attempt ${i} failed (referer=${a.referer ? 'yes' : 'no'}):`,
                err instanceof Error ? err.message : err,
                a.url.slice(0, 140),
            );
            throw err;
        }
    });

    try {
        const winner = await Promise.any(promises);
        controllers.forEach((c, i) => {
            if (i !== winner.index) c.abort();
        });
        signal.removeEventListener('abort', onOuterAbort);
        return { bytes: winner.bytes, mime: winner.mime, url: winner.url };
    } catch (err) {
        signal.removeEventListener('abort', onOuterAbort);
        console.warn('[unfurl] all image fetch attempts failed:', err instanceof Error ? err.message : err);
        return null;
    }
}

export async function unfurlUrl(rawUrl: string): Promise<UnfurlResult> {
    let url: string;
    try {
        url = normalizeUrl(rawUrl);
    } catch {
        return { status: 'failed', error: 'Invalid URL' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        let htmlResult: FetchResult;
        try {
            htmlResult = await hardenedFetch(
                rewriteForFetch(url),
                'text/html,application/xhtml+xml',
                MAX_HTML_BYTES,
                controller.signal,
            );
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const isBlock = /^Blocked/.test(message);
            return isBlock ? { status: 'blocked', error: message } : { status: 'failed', error: message };
        }

        const ct = htmlResult.contentType.split(';')[0].trim().toLowerCase();
        if (ct && !ct.includes('html') && !ct.includes('xml')) {
            return { status: 'failed', error: `Unsupported content-type: ${ct}` };
        }

        const html = decodeHtml(htmlResult.body, htmlResult.contentType);
        const metadata = parseOgMetadata(html, htmlResult.finalUrl);
        metadata.url = url;
        console.info('[unfurl]', url, metadata.image_url ? `og:image=${metadata.image_url}` : 'no og:image found');

        if (looksLikeAntiBot(metadata.title)) {
            return { status: 'failed', error: 'Anti-bot wall detected' };
        }

        let imageBytes: Buffer | undefined;
        let imageMime: string | undefined;
        const candidates = getImageCandidates(html, htmlResult.finalUrl, metadata);
        if (candidates.length > 0) {
            const imageController = new AbortController();
            const imageTimeout = setTimeout(() => imageController.abort(), IMAGE_FETCH_TIMEOUT_MS);
            try {
                const img = await raceImageFetch(candidates, url, imageController.signal);
                if (img) {
                    imageBytes = img.bytes;
                    imageMime = img.mime;
                    console.info('[unfurl] image fetched:', img.mime, `${img.bytes.length}b`, img.url);
                }
            } finally {
                clearTimeout(imageTimeout);
            }
        }

        if (!imageBytes && isRedditUrl(url)) {
            const jsonController = new AbortController();
            const jsonTimeout = setTimeout(() => jsonController.abort(), IMAGE_FETCH_TIMEOUT_MS);
            try {
                const jsonCandidates = await fetchRedditJsonImages(url, jsonController.signal);
                const filtered = jsonCandidates.map((c) => upgradeToHttps(c)).filter((c) => !candidates.includes(c));
                if (filtered.length > 0) {
                    console.info('[unfurl] reddit json candidates:', filtered.length);
                    const img = await raceImageFetch(filtered, url, jsonController.signal);
                    if (img) {
                        imageBytes = img.bytes;
                        imageMime = img.mime;
                        if (!metadata.image_url) metadata.image_url = img.url;
                        console.info('[unfurl] reddit json image fetched:', img.mime, `${img.bytes.length}b`, img.url);
                    }
                }
            } finally {
                clearTimeout(jsonTimeout);
            }
        }

        if (!imageBytes) {
            console.warn('[unfurl] image unavailable; sending metadata-only preview');
        }

        return {
            status: 'ok',
            metadata,
            imageBytes,
            imageMime,
        };
    } finally {
        clearTimeout(timeout);
    }
}
