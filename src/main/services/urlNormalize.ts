const TRACKING_PARAMS = new Set([
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'utm_id',
    'utm_name',
    'fbclid',
    'gclid',
    'gclsrc',
    'dclid',
    'msclkid',
    'mc_eid',
    'mc_cid',
    '_ga',
    'igshid',
    'ref',
    'ref_src',
    'ref_url',
]);

export function normalizeUrl(input: string): string {
    const u = new URL(input);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    u.protocol = u.protocol.toLowerCase();

    const params = u.searchParams;
    const keysToDelete: string[] = [];
    for (const key of params.keys()) {
        if (TRACKING_PARAMS.has(key.toLowerCase())) {
            keysToDelete.push(key);
        }
    }
    for (const key of keysToDelete) params.delete(key);

    if ((u.protocol === 'https:' && u.port === '443') || (u.protocol === 'http:' && u.port === '80')) {
        u.port = '';
    }

    return u.toString();
}
