export async function hkdf(
    inputKeyMaterial: Uint8Array<ArrayBuffer>,
    salt: Uint8Array<ArrayBuffer>,
    info: Uint8Array<ArrayBuffer>,
    length: number = 32,
): Promise<Uint8Array<ArrayBuffer>> {
    const baseKey = await crypto.subtle.importKey('raw', inputKeyMaterial, 'HKDF', false, [
        'deriveBits',
    ]);

    const bits = await crypto.subtle.deriveBits(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt,
            info,
        },
        baseKey,
        length * 8,
    );

    return new Uint8Array(bits);
}

export async function hkdfDeriveTwo(
    inputKeyMaterial: Uint8Array<ArrayBuffer>,
    salt: Uint8Array<ArrayBuffer>,
    info: Uint8Array<ArrayBuffer>,
): Promise<[Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>]> {
    const derived = await hkdf(inputKeyMaterial, salt, info, 64);
    return [derived.slice(0, 32), derived.slice(32, 64)];
}

export async function hmacSHA256(key: Uint8Array<ArrayBuffer>, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
    return new Uint8Array(signature);
}

export async function ratchetChainKey(chainKey: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    return hmacSHA256(chainKey, new Uint8Array([0x02]));
}

export async function deriveMessageKey(chainKey: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    return hmacSHA256(chainKey, new Uint8Array([0x01]));
}
