import { hkdf, hmacSHA256 } from './hkdf';

const SSE_VERSION = 'laradisco-sse-v1';
const SSE_INFO = 'sse-search-key';
const MIN_WORD_LENGTH = 2;
const MAX_TOKENS = 500;

export async function deriveSearchKey(
    baseChainKey: Uint8Array<ArrayBuffer>,
    conversationId: string,
): Promise<Uint8Array<ArrayBuffer>> {
    const salt = new TextEncoder().encode(`${SSE_VERSION}:${conversationId}`);
    const info = new TextEncoder().encode(SSE_INFO);
    return hkdf(baseChainKey, salt, info, 32);
}

export function normalizeText(text: string): string[] {
    const cleaned = text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleaned) return [];

    const words = cleaned.split(' ');
    const unique = [...new Set(words)];
    return unique.filter((w) => w.length >= MIN_WORD_LENGTH);
}

export async function generateSearchTokens(searchKey: Uint8Array<ArrayBuffer>, plaintext: string): Promise<string[]> {
    const words = normalizeText(plaintext);
    if (words.length === 0) return [];

    const seen = new Set<string>();
    const tokens: string[] = [];
    for (const word of words) {
        for (let start = 0; start < word.length; start++) {
            for (let end = start + MIN_WORD_LENGTH; end <= word.length; end++) {
                if (tokens.length >= MAX_TOKENS) break;
                const sub = word.slice(start, end);
                if (seen.has(sub)) continue;
                seen.add(sub);
                const subBytes = new TextEncoder().encode(sub);
                const hmac = await hmacSHA256(searchKey, subBytes);
                tokens.push(uint8ArrayToHex(hmac));
            }
            if (tokens.length >= MAX_TOKENS) break;
        }
        if (tokens.length >= MAX_TOKENS) break;
    }

    return tokens;
}

export async function generateSearchTrapdoor(searchKey: Uint8Array<ArrayBuffer>, query: string): Promise<string[]> {
    const words = normalizeText(query);
    if (words.length === 0) return [];

    const tokens: string[] = [];
    for (const word of words) {
        const wordBytes = new TextEncoder().encode(word);
        const hmac = await hmacSHA256(searchKey, wordBytes);
        tokens.push(uint8ArrayToHex(hmac));
    }

    return tokens;
}

function uint8ArrayToHex(bytes: Uint8Array<ArrayBuffer>): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
