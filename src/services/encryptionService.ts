/**
 * Teeex Studio — Client-Side End-to-End Encryption Service (AES-256-GCM)
 * Zero-Knowledge cryptographic privacy for proprietary research manuscripts
 */

const SALT_BYTES = 16;
const IV_BYTES = 12;

// OWASP recommendation for PBKDF2-HMAC-SHA256: 600,000 iterations
export const CURRENT_ITERATIONS = 600000;
export const LEGACY_ITERATIONS = 100000;
export const CURRENT_VERSION = 1;

// 3-byte magic marker 'TEX' (0x54, 0x45, 0x58)
const MAGIC_BYTES = new Uint8Array([0x54, 0x45, 0x58]);

const BASE64_CHUNK_SIZE = 8192; // 8 KB chunks to prevent call-stack RangeError on large documents

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

export async function encryptText(
  plainText: string,
  passphrase: string,
  saltB64: string,
  iterations: number = CURRENT_ITERATIONS
): Promise<string> {
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

  // Payload format (v1):
  // [0..2]: MAGIC 'TEX' (3 bytes)
  // [3]: Version 1 (1 byte)
  // [4..7]: Iterations (4 bytes, uint32 big-endian)
  // [8..19]: IV (12 bytes)
  // [20..end]: Ciphertext + GCM auth tag
  const headerLen = 3 + 1 + 4 + IV_BYTES; // 20 bytes
  const payload = new Uint8Array(headerLen + cipherBytes.length);

  payload.set(MAGIC_BYTES, 0);
  payload[3] = CURRENT_VERSION;
  new DataView(payload.buffer, payload.byteOffset, payload.byteLength).setUint32(4, iterations, false);
  payload.set(iv, 8);
  payload.set(cipherBytes, headerLen);

  return bytesToBase64(payload);
}

export async function decryptText(
  cipherB64: string,
  passphrase: string,
  saltB64: string
): Promise<string> {
  const salt = base64ToBytes(saltB64);
  const rawPayload = base64ToBytes(cipherB64);

  // Check for Version 1 header: starts with 'TEX' (0x54, 0x45, 0x58) and version byte 1
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
    // Legacy v0 format: 12 bytes IV followed by ciphertext with default 100,000 iterations
    iv = rawPayload.subarray(0, IV_BYTES);
    cipherBytes = rawPayload.subarray(IV_BYTES);
  }

  const key = await deriveKey(passphrase, salt, iterations);
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    cipherBytes as unknown as BufferSource
  );

  const dec = new TextDecoder();
  return dec.decode(decryptedBuffer);
}
