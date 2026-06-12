/**
 * Anchor-based pagination metadata returned by the message list endpoints.
 *
 * The backend (`GET /channels/{id}/messages`, `GET /direct-messages/{id}`)
 * returns messages in ascending order (oldest -> newest) and exposes the
 * window's edges and whether more exist on either side via the response
 * `meta` object. There is no JSON:API `links` cursor; callers page by passing
 * `before=<oldestId>` (older) or `after=<newestId>` (newer).
 */
export interface PageMeta {
    hasMoreBefore: boolean;
    hasMoreAfter: boolean;
    oldestId: string | null;
    newestId: string | null;
}

export function readPageMeta(meta: Record<string, unknown> | undefined): PageMeta {
    return {
        hasMoreBefore: meta?.has_more_before === true,
        hasMoreAfter: meta?.has_more_after === true,
        oldestId: meta?.oldest_id != null ? String(meta.oldest_id) : null,
        newestId: meta?.newest_id != null ? String(meta.newest_id) : null,
    };
}
