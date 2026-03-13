const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const NONCE_LENGTH = 12;

export function generateAESKey(): Uint8Array<ArrayBuffer> {
    return crypto.getRandomValues(new Uint8Array(32));
}

export function generateNonce(): Uint8Array<ArrayBuffer> {
    return crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
}

async function importKey(rawKey: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
    return crypto.subtle.importKey('raw', rawKey, { name: ALGORITHM, length: KEY_LENGTH }, false, [
        'encrypt',
        'decrypt',
    ]);
}

export async function encrypt(
    key: Uint8Array<ArrayBuffer>,
    plaintext: Uint8Array<ArrayBuffer>,
    additionalData?: Uint8Array<ArrayBuffer>,
): Promise<{ ciphertext: Uint8Array<ArrayBuffer>; nonce: Uint8Array<ArrayBuffer> }> {
    const nonce = generateNonce();
    const cryptoKey = await importKey(key);

    const encrypted = await crypto.subtle.encrypt(
        {
            name: ALGORITHM,
            iv: nonce,
            additionalData,
        },
        cryptoKey,
        plaintext,
    );

    return {
        ciphertext: new Uint8Array(encrypted),
        nonce,
    };
}

export async function decrypt(
    key: Uint8Array<ArrayBuffer>,
    ciphertext: Uint8Array<ArrayBuffer>,
    nonce: Uint8Array<ArrayBuffer>,
    additionalData?: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
    const cryptoKey = await importKey(key);

    const decrypted = await crypto.subtle.decrypt(
        {
            name: ALGORITHM,
            iv: nonce,
            additionalData,
        },
        cryptoKey,
        ciphertext,
    );

    return new Uint8Array(decrypted);
}

export async function encryptString(
    key: Uint8Array<ArrayBuffer>,
    plaintext: string,
): Promise<{ ciphertext: string; nonce: string }> {
    const encoder = new TextEncoder();
    const { ciphertext, nonce } = await encrypt(key, encoder.encode(plaintext));
    return {
        ciphertext: Buffer.from(ciphertext).toString('base64'),
        nonce: Buffer.from(nonce).toString('base64'),
    };
}

export async function decryptString(
    key: Uint8Array<ArrayBuffer>,
    ciphertextB64: string,
    nonceB64: string,
): Promise<string> {
    const ciphertext = Uint8Array.from(Buffer.from(ciphertextB64, 'base64'));
    const nonce = Uint8Array.from(Buffer.from(nonceB64, 'base64'));
    const plaintext = await decrypt(key, ciphertext, nonce);
    return new TextDecoder().decode(plaintext);
}
