/**
 * Teeex Studio — Client-Side End-to-End Encryption Service (AES-256-GCM)
 * Offloads PBKDF2 derivation & GCM operations to crypto.worker.ts with session key caching.
 */

const SALT_BYTES = 16;
const IV_BYTES = 12;

export const CURRENT_ITERATIONS = 600000;
export const LEGACY_ITERATIONS = 100000;
export const CURRENT_VERSION = 1;

const MAGIC_BYTES = new Uint8Array([0x54, 0x45, 0x58]);
const BASE64_CHUNK_SIZE = 8192;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + BASE64_CHUNK_SIZE, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number = CURRENT_ITERATIONS
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
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
}

export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return bytesToBase64(salt);
}

// ------------------------------------------------------------------ Worker RPC --

let cryptoWorker: Worker | null = null;
let workerDisabled = false;
let nextRpcId = 1;
const pendingRpcs = new Map<
  number,
  { resolve: (val: string) => void; reject: (err: Error) => void }
>();

function getCryptoWorker(): Worker | null {
  if (workerDisabled || typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  if (cryptoWorker) return cryptoWorker;

  try {
    const worker = new Worker(new URL('../workers/crypto.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (
      event: MessageEvent<{ id: number; ok: boolean; result?: string; error?: string }>
    ) => {
      const { id, ok, result, error } = event.data;
      const pending = pendingRpcs.get(id);
      if (!pending) return;
      pendingRpcs.delete(id);
      if (ok) {
        pending.resolve(result ?? '');
      } else {
        pending.reject(new Error(error || 'Crypto worker failure'));
      }
    };
    worker.onerror = () => {
      workerDisabled = true;
      cryptoWorker = null;
      for (const [, pending] of pendingRpcs) {
        pending.reject(new Error('Crypto worker crashed'));
      }
      pendingRpcs.clear();
    };
    cryptoWorker = worker;
    return worker;
  } catch {
    workerDisabled = true;
    return null;
  }
}

function callCryptoWorker(payload: Record<string, unknown>): Promise<string> | null {
  const worker = getCryptoWorker();
  if (!worker) return null;

  const id = nextRpcId++;
  return new Promise<string>((resolve, reject) => {
    pendingRpcs.set(id, { resolve, reject });
    worker.postMessage({ id, ...payload });
  });
}

/**
 * Purges derived session keys cached inside the crypto worker (call on vault lock / sign-out).
 */
export function clearEncryptionSessionCache(): void {
  void callCryptoWorker({ op: 'clear' })?.catch(() => { });
}

// ----------------------------------------------------------- Public Encrypt API --

export async function encryptText(
  plainText: string,
  passphrase: string,
  saltB64: string,
  iterations: number = CURRENT_ITERATIONS
): Promise<string> {
  const workerPromise = callCryptoWorker({
    op: 'encrypt',
    plainText,
    passphrase,
    saltB64,
    iterations,
  });
  if (workerPromise) {
    return workerPromise;
  }

  // Fallback for non-Worker environments (e.g., SSR / Vitest)
  const salt = base64ToBytes(saltB64);
  const key = await deriveKey(passphrase, salt, iterations);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const enc = new TextEncoder();

  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plainText)
  );

  const cipherBytes = new Uint8Array(cipherBuffer);
  const headerLen = 3 + 1 + 4 + IV_BYTES;
  const payload = new Uint8Array(headerLen + cipherBytes.length);

  payload.set(MAGIC_BYTES, 0);
  payload[3] = CURRENT_VERSION;
  new DataView(payload.buffer, payload.byteOffset, payload.byteLength).setUint32(
    4,
    iterations,
    false
  );
  payload.set(iv, 8);
  payload.set(cipherBytes, headerLen);

  return bytesToBase64(payload);
}

export async function decryptText(
  cipherB64: string,
  passphrase: string,
  saltB64: string
): Promise<string> {
  const workerPromise = callCryptoWorker({
    op: 'decrypt',
    cipherB64,
    passphrase,
    saltB64,
  });
  if (workerPromise) {
    return workerPromise;
  }

  // Fallback for non-Worker environments
  const salt = base64ToBytes(saltB64);
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

  const key = await deriveKey(passphrase, salt, iterations);
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    cipherBytes as unknown as BufferSource
  );

  return new TextDecoder().decode(decryptedBuffer);
}