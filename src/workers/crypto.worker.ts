/**
 * Teeex Studio — Off-Main-Thread Web Crypto Worker
 * Caches non-extractable AES-256-GCM keys per (iterations, salt, passphrase digest)
 * in isolated worker memory so 600k-iteration PBKDF2 never stalls UI keystrokes.
 */

const IV_BYTES = 12;
const LEGACY_ITERATIONS = 100000;
const CURRENT_VERSION = 1;
const MAGIC_BYTES = new Uint8Array([0x54, 0x45, 0x58]); // 'TEX'
const BASE64_CHUNK_SIZE = 8192;
const MAX_CACHED_KEYS = 8;

const keyCache = new Map<string, CryptoKey>();

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i += BASE64_CHUNK_SIZE) {
        const chunk = bytes.subarray(i, Math.min(i + BASE64_CHUNK_SIZE, len));
        binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function computeCacheId(
    passphrase: string,
    saltB64: string,
    iterations: number
): Promise<string> {
    const material = new TextEncoder().encode(`${iterations}:${saltB64}:${passphrase}`);
    const digest = await crypto.subtle.digest('SHA-256', material);
    return bytesToBase64(new Uint8Array(digest));
}

async function getOrDeriveAesKey(
    passphrase: string,
    saltB64: string,
    iterations: number
): Promise<CryptoKey> {
    const cacheId = await computeCacheId(passphrase, saltB64, iterations);
    const cached = keyCache.get(cacheId);
    if (cached) {
        // Refresh LRU order
        keyCache.delete(cacheId);
        keyCache.set(cacheId, cached);
        return cached;
    }

    const salt = base64ToBytes(saltB64);
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    const derived = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt as unknown as BufferSource,
            iterations,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );

    if (keyCache.size >= MAX_CACHED_KEYS) {
        const oldestKey = keyCache.keys().next().value;
        if (oldestKey !== undefined) keyCache.delete(oldestKey);
    }
    keyCache.set(cacheId, derived);
    return derived;
}

async function handleEncrypt(
    plainText: string,
    passphrase: string,
    saltB64: string,
    iterations: number
): Promise<string> {
    const key = await getOrDeriveAesKey(passphrase, saltB64, iterations);
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const cipherBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(plainText)
    );

    const cipherBytes = new Uint8Array(cipherBuffer);
    const headerLen = 3 + 1 + 4 + IV_BYTES; // 20 bytes
    const payload = new Uint8Array(headerLen + cipherBytes.length);

    payload.set(MAGIC_BYTES, 0);
    payload[3] = CURRENT_VERSION;
    new DataView(payload.buffer).setUint32(4, iterations, false);
    payload.set(iv, 8);
    payload.set(cipherBytes, headerLen);

    return bytesToBase64(payload);
}

async function handleDecrypt(
    cipherB64: string,
    passphrase: string,
    saltB64: string
): Promise<string> {
    const rawPayload = base64ToBytes(cipherB64);

    const isV1 =
        rawPayload.length >= 20 &&
        rawPayload[0] === 0x54 &&
        rawPayload[1] === 0x45 &&
        rawPayload[2] === 0x58 &&
        rawPayload[3] === 0x01;

    let iterations = LEGACY_ITERATIONS;
    let iv: Uint8Array;
    let cipherBytes: Uint8Array;

    if (isV1) {
        const view = new DataView(rawPayload.buffer, rawPayload.byteOffset, rawPayload.byteLength);
        iterations = view.getUint32(4, false);
        iv = rawPayload.subarray(8, 20);
        cipherBytes = rawPayload.subarray(20);
    } else {
        iv = rawPayload.subarray(0, IV_BYTES);
        cipherBytes = rawPayload.subarray(IV_BYTES);
    }

    const key = await getOrDeriveAesKey(passphrase, saltB64, iterations);
    const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        key,
        cipherBytes as unknown as BufferSource
    );

    return new TextDecoder().decode(decryptedBuffer);
}

type CryptoWorkerRequest =
    | { id: number; op: 'encrypt'; plainText: string; passphrase: string; saltB64: string; iterations: number }
    | { id: number; op: 'decrypt'; cipherB64: string; passphrase: string; saltB64: string }
    | { id: number; op: 'clear' };

self.onmessage = async (event: MessageEvent<CryptoWorkerRequest>) => {
    const msg = event.data;
    if (msg.op === 'clear') {
        keyCache.clear();
        self.postMessage({ id: msg.id, ok: true, result: '' });
        return;
    }

    try {
        const result =
            msg.op === 'encrypt'
                ? await handleEncrypt(msg.plainText, msg.passphrase, msg.saltB64, msg.iterations)
                : await handleDecrypt(msg.cipherB64, msg.passphrase, msg.saltB64);
        self.postMessage({ id: msg.id, ok: true, result });
    } catch (err) {
        self.postMessage({
            id: msg.id,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
        });
    }
};