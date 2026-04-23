export async function decryptAttachment(
    encryptedData: BufferSource,
    keyBase64: string,
    ivBase64: string,
): Promise<ArrayBuffer> {
    const keyBytes = Uint8Array.from(atob(keyBase64), (c) => c.charCodeAt(0));
    const ivBytes = Uint8Array.from(atob(ivBase64), (c) => c.charCodeAt(0));

    const cryptoKey = await window.crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);

    return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes, tagLength: 128 }, cryptoKey, encryptedData);
}
