import { lookup } from 'dns/promises';
import { eq } from 'drizzle-orm';
import ipaddr from 'ipaddr.js';
import { getDb } from '../db';
import { linkPreviews } from '../db/schema';
import { normalizeUrl } from './urlNormalize';

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 5;
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0';

const CACHE_TTL_OK = 24 * 60 * 60 * 1000;
const CACHE_TTL_FAILED = 60 * 60 * 1000;

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

function isPublicIp(ip: string): boolean {
    if (!ipaddr.isValid(ip)) return false;
    const addr = ipaddr.parse(ip);
    const range = addr.range();
    // Accept only unicast ranges that route on the public internet.
    if (addr.kind() === 'ipv4') {
        return range === 'unicast';
    }
    // IPv6: unicast is the global unicast range; reject everything else.
    return range === 'unicast';
}

async function assertPublicHostname(hostname: string): Promise<void> {
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
            currentUrl = new URL(location, currentUrl).toString();
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

function decodeHtmlEntities(input: string): string {
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

function extractCharset(contentType: string, html: Buffer): string {
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

function parseMetaTags(html: string): Map<string, string> {
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

function extractTitle(html: string): string | undefined {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!match) return undefined;
    return decodeHtmlEntities(match[1]).trim().replace(/\s+/g, ' ');
}

function parseOgMetadata(html: string, finalUrl: string): LinkPreviewMetadata {
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

function lookupCache(url: string): UnfurlResult | null {
    const db = getDb();
    const row = db.select().from(linkPreviews).where(eq(linkPreviews.url, url)).get();
    if (!row) return null;

    const age = Date.now() - row.fetched_at;
    if (row.status === 'blocked') {
        return { status: 'blocked', error: row.error ?? 'Blocked' };
    }
    if (row.status === 'failed') {
        if (age > CACHE_TTL_FAILED) return null;
        return { status: 'failed', error: row.error ?? 'Failed' };
    }
    if (row.status === 'ok') {
        if (age > CACHE_TTL_OK) return null;
        try {
            const metadata = JSON.parse(row.metadata_json ?? '{}') as LinkPreviewMetadata;
            return {
                status: 'ok',
                metadata,
                imageBytes: row.image_blob ?? undefined,
                imageMime: row.image_mime ?? undefined,
                imageWidth: row.image_width ?? undefined,
                imageHeight: row.image_height ?? undefined,
            };
        } catch {
            return null;
        }
    }
    return null;
}

function writeCache(url: string, result: UnfurlResult): void {
    const db = getDb();
    const values =
        result.status === 'ok'
            ? {
                  url,
                  status: 'ok' as const,
                  metadata_json: JSON.stringify(result.metadata),
                  image_blob: result.imageBytes ?? null,
                  image_mime: result.imageMime ?? null,
                  image_width: result.imageWidth ?? null,
                  image_height: result.imageHeight ?? null,
                  error: null,
                  fetched_at: Date.now(),
              }
            : {
                  url,
                  status: result.status,
                  metadata_json: null,
                  image_blob: null,
                  image_mime: null,
                  image_width: null,
                  image_height: null,
                  error: result.error,
                  fetched_at: Date.now(),
              };

    db.insert(linkPreviews)
        .values(values)
        .onConflictDoUpdate({
            target: linkPreviews.url,
            set: values,
        })
        .run();
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

const VERIFICATION_TITLE_PATTERNS = [
    /please wait.*verification/i,
    /just a moment\.\.\./i,
    /attention required/i,
    /access denied/i,
];

function looksLikeAntiBot(title: string): boolean {
    return VERIFICATION_TITLE_PATTERNS.some((re) => re.test(title));
}

async function fetchImage(
    imageUrl: string,
    signal: AbortSignal,
    referer: string,
): Promise<{ bytes: Buffer; mime: string } | null> {
    const attempts: (string | undefined)[] = [referer, undefined];
    for (const ref of attempts) {
        try {
            const result = await hardenedFetch(imageUrl, 'image/*', MAX_IMAGE_BYTES, signal, ref);
            const mime = result.contentType.split(';')[0].trim().toLowerCase();
            if (!mime.startsWith('image/')) {
                console.warn('[unfurl] image fetch non-image mime:', mime, imageUrl);
                return null;
            }
            return { bytes: result.body, mime };
        } catch (err) {
            console.warn(`[unfurl] image fetch failed (referer=${ref ?? 'none'}):`, err, imageUrl);
        }
    }
    return null;
}

export async function unfurlUrl(rawUrl: string): Promise<UnfurlResult> {
    let url: string;
    try {
        url = normalizeUrl(rawUrl);
    } catch {
        return { status: 'failed', error: 'Invalid URL' };
    }

    const cached = lookupCache(url);
    if (cached) return cached;

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
            const result: UnfurlResult = isBlock
                ? { status: 'blocked', error: message }
                : { status: 'failed', error: message };
            writeCache(url, result);
            return result;
        }

        const ct = htmlResult.contentType.split(';')[0].trim().toLowerCase();
        if (ct && !ct.includes('html') && !ct.includes('xml')) {
            const failed: UnfurlResult = { status: 'failed', error: `Unsupported content-type: ${ct}` };
            writeCache(url, failed);
            return failed;
        }

        const html = decodeHtml(htmlResult.body, htmlResult.contentType);
        const metadata = parseOgMetadata(html, htmlResult.finalUrl);
        metadata.url = url;

        if (looksLikeAntiBot(metadata.title)) {
            const failed: UnfurlResult = { status: 'failed', error: 'Anti-bot wall detected' };
            writeCache(url, failed);
            return failed;
        }

        let imageBytes: Buffer | undefined;
        let imageMime: string | undefined;
        if (metadata.image_url) {
            const img = await fetchImage(metadata.image_url, controller.signal, url);
            if (img) {
                imageBytes = img.bytes;
                imageMime = img.mime;
            }
        }

        const ok: UnfurlResult = {
            status: 'ok',
            metadata,
            imageBytes,
            imageMime,
        };
        writeCache(url, ok);
        return ok;
    } finally {
        clearTimeout(timeout);
    }
}

export function clearLinkPreviewCache(): void {
    const db = getDb();
    db.delete(linkPreviews).run();
}
