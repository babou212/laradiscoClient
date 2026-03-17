import { ed25519 } from '@noble/curves/ed25519.js';
import { encrypt, decrypt } from './aes-gcm';
import { ratchetChainKey, deriveMessageKey } from './hkdf';
import type { SenderKeyState } from './types';

export function createSenderKey(distributionId: string): SenderKeyState {
    const chainKey = crypto.getRandomValues(new Uint8Array(32));
    const signingPrivateKey = new Uint8Array(ed25519.utils.randomSecretKey());
    const signingPublicKey = new Uint8Array(ed25519.getPublicKey(signingPrivateKey));

    return {
        distributionId,
        chainKey,
        signingKeyPair: {
            publicKey: signingPublicKey,
            privateKey: signingPrivateKey,
        },
        chainIndex: 0,
        baseChainKey: new Uint8Array(chainKey),
        baseChainIndex: 0,
    };
}

export interface SenderKeyDistribution {
    distributionId: string;
    chainKey: string;
    signingPublicKey: string;
    chainIndex: number;
}

export function exportSenderKeyDistribution(state: SenderKeyState): SenderKeyDistribution {
    return {
        distributionId: state.distributionId,
        chainKey: Buffer.from(state.baseChainKey ?? state.chainKey).toString('base64'),
        signingPublicKey: Buffer.from(state.signingKeyPair.publicKey).toString('base64'),
        chainIndex: state.baseChainIndex ?? state.chainIndex,
    };
}

export function importSenderKeyDistribution(dist: SenderKeyDistribution): SenderKeyState {
    const chainKey = Uint8Array.from(Buffer.from(dist.chainKey, 'base64'));
    return {
        distributionId: dist.distributionId,
        chainKey: new Uint8Array(chainKey),
        signingKeyPair: {
            publicKey: Uint8Array.from(Buffer.from(dist.signingPublicKey, 'base64')),
            privateKey: new Uint8Array(0),
        },
        chainIndex: dist.chainIndex,
        baseChainKey: new Uint8Array(chainKey),
        baseChainIndex: dist.chainIndex,
    };
}

export interface SenderKeyMessage {
    ciphertext: Uint8Array<ArrayBuffer>;
    nonce: Uint8Array<ArrayBuffer>;
    signature: Uint8Array<ArrayBuffer>;
    chainIndex: number;
    distributionId: string;
}

function buildSignedPayload(
    ciphertext: Uint8Array<ArrayBuffer>,
    nonce: Uint8Array<ArrayBuffer>,
    chainIndex: number,
    distributionId: string,
): Uint8Array {
    const distributionIdBytes = new TextEncoder().encode(distributionId);
    const chainIndexBytes = new Uint8Array(4);
    new DataView(chainIndexBytes.buffer).setUint32(0, chainIndex, false);

    const result = new Uint8Array(
        ciphertext.length + nonce.length + 4 + distributionIdBytes.length,
    );
    let offset = 0;
    result.set(ciphertext, offset); offset += ciphertext.length;
    result.set(nonce, offset); offset += nonce.length;
    result.set(chainIndexBytes, offset); offset += 4;
    result.set(distributionIdBytes, offset);
    return result;
}

export async function senderKeyEncrypt(
    state: SenderKeyState,
    plaintext: Uint8Array<ArrayBuffer>,
): Promise<SenderKeyMessage> {
    const messageKey = await deriveMessageKey(state.chainKey);

    const { ciphertext, nonce } = await encrypt(messageKey, plaintext);

    const dataToSign = buildSignedPayload(ciphertext, nonce, state.chainIndex, state.distributionId);
    const signature = new Uint8Array(ed25519.sign(dataToSign, state.signingKeyPair.privateKey));

    const result: SenderKeyMessage = {
        ciphertext,
        nonce,
        signature,
        chainIndex: state.chainIndex,
        distributionId: state.distributionId,
    };

    state.chainKey = await ratchetChainKey(state.chainKey);
    state.chainIndex++;

    return result;
}

export async function senderKeyDecrypt(
    state: SenderKeyState,
    message: SenderKeyMessage,
): Promise<Uint8Array<ArrayBuffer>> {
    if (state.signingKeyPair.publicKey.length > 0) {
        const dataToVerify = buildSignedPayload(message.ciphertext, message.nonce, message.chainIndex, message.distributionId);
        const valid = ed25519.verify(message.signature, dataToVerify, state.signingKeyPair.publicKey);
        if (!valid) {
            throw new Error('SenderKey: Invalid message signature');
        }
    }

    const baseKey = state.baseChainKey ?? state.chainKey;
    const baseIdx = state.baseChainIndex ?? state.chainIndex;

    if (message.chainIndex < baseIdx) {
        throw new Error(`SenderKey: Message chain index ${message.chainIndex} is before distribution start ${baseIdx}`);
    }

    let currentChainKey = baseKey;
    for (let i = baseIdx; i < message.chainIndex; i++) {
        currentChainKey = await ratchetChainKey(currentChainKey);
    }

    const messageKey = await deriveMessageKey(currentChainKey);

    const nextIndex = message.chainIndex + 1;
    if (nextIndex > state.chainIndex) {
        state.chainKey = await ratchetChainKey(currentChainKey);
        state.chainIndex = nextIndex;
    }

    return decrypt(messageKey, message.ciphertext, message.nonce);
}

export function serializeSenderKey(state: SenderKeyState): string {
    return JSON.stringify({
        distributionId: state.distributionId,
        chainKey: Buffer.from(state.chainKey).toString('base64'),
        signingKeyPair: {
            publicKey: Buffer.from(state.signingKeyPair.publicKey).toString('base64'),
            privateKey: Buffer.from(state.signingKeyPair.privateKey).toString('base64'),
        },
        chainIndex: state.chainIndex,
        baseChainKey: Buffer.from(state.baseChainKey ?? state.chainKey).toString('base64'),
        baseChainIndex: state.baseChainIndex ?? state.chainIndex,
    });
}

export function deserializeSenderKey(json: string): SenderKeyState {
    const obj = JSON.parse(json);
    const chainKey = Uint8Array.from(Buffer.from(obj.chainKey, 'base64'));
    return {
        distributionId: obj.distributionId,
        chainKey,
        signingKeyPair: {
            publicKey: Uint8Array.from(Buffer.from(obj.signingKeyPair.publicKey, 'base64')),
            privateKey: Uint8Array.from(Buffer.from(obj.signingKeyPair.privateKey, 'base64')),
        },
        chainIndex: obj.chainIndex,
        baseChainKey: obj.baseChainKey
            ? Uint8Array.from(Buffer.from(obj.baseChainKey, 'base64'))
            : new Uint8Array(chainKey),
        baseChainIndex: obj.baseChainIndex ?? obj.chainIndex,
    };
}
