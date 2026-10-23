import { describe, it, expect } from 'vitest';
import {
  deriveKey,
  generateSalt,
  encryptText,
  decryptText,
  bytesToBase64,
  base64ToBytes,
  CURRENT_ITERATIONS,
  LEGACY_ITERATIONS,
  CURRENT_VERSION,
} from '../../src/services/encryptionService';

describe('Encryption Service — Large Documents, Versioning & OWASP PBKDF2', () => {
  const passphrase = 'SuperSecretPassphrase!2026';

  it('generates a valid base64 salt', () => {
    const salt = generateSalt();
    expect(salt).toBeTruthy();
    const bytes = base64ToBytes(salt);
    expect(bytes.length).toBe(16);
  });

  it('converts large byte arrays to and from base64 without RangeError', () => {
    // 256 KB of arbitrary binary data (well above the ~65,536 argument limit)
    const largeBytes = new Uint8Array(256 * 1024);
    for (let i = 0; i < largeBytes.length; i++) {
      largeBytes[i] = i % 256;
    }

    const b64 = bytesToBase64(largeBytes);
    expect(typeof b64).toBe('string');
    expect(b64.length).toBeGreaterThan(0);

    const recovered = base64ToBytes(b64);
    expect(recovered.length).toBe(largeBytes.length);
    expect(recovered[0]).toBe(0);
    expect(recovered[255]).toBe(255);
    expect(recovered[1000]).toBe(1000 % 256);
  });

  it('encrypts and decrypts normal documents with versioned v1 header and 600,000 iterations', async () => {
    const salt = generateSalt();
    const plainText = '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}';

    const cipher = await encryptText(plainText, passphrase, salt);
    expect(cipher).toBeTruthy();

    // Inspect the raw payload header
    const rawPayload = base64ToBytes(cipher);
    expect(rawPayload.length).toBeGreaterThan(20);

    // Magic marker 'TEX' (0x54, 0x45, 0x58)
    expect(rawPayload[0]).toBe(0x54);
    expect(rawPayload[1]).toBe(0x45);
    expect(rawPayload[2]).toBe(0x58);

    // Version byte
    expect(rawPayload[3]).toBe(CURRENT_VERSION);

    // Iterations uint32 big-endian
    const view = new DataView(rawPayload.buffer, rawPayload.byteOffset, rawPayload.byteLength);
    const parsedIterations = view.getUint32(4, false);
    expect(parsedIterations).toBe(CURRENT_ITERATIONS);
    expect(parsedIterations).toBe(600000);

    // Decrypt
    const decrypted = await decryptText(cipher, passphrase, salt);
    expect(decrypted).toBe(plainText);
  });

  it('encrypts and decrypts large documents (> 150 KB) without RangeError', async () => {
    const salt = generateSalt();
    // Generate ~200 KB LaTeX document
    let largeDoc = '\\documentclass{article}\n\\begin{document}\n';
    for (let i = 0; i < 2500; i++) {
      largeDoc += `\\section{Section ${i}}\nThis is paragraph ${i} with equations $E = mc^2$.\n`;
    }
    largeDoc += '\\end{document}';

    expect(largeDoc.length).toBeGreaterThan(150 * 1024);

    const cipher = await encryptText(largeDoc, passphrase, salt);
    expect(cipher).toBeTruthy();

    const decrypted = await decryptText(cipher, passphrase, salt);
    expect(decrypted).toBe(largeDoc);
  });

  it('seamlessly decrypts legacy v0 payloads without header using 100,000 iterations', async () => {
    const salt = generateSalt();
    const plainText = 'Legacy Document Content from previous version';

    // Manually construct a legacy v0 payload:
    // [ 12-byte IV ] [ AES-GCM Ciphertext ] with 100,000 iterations
    const saltBytes = base64ToBytes(salt);
    const legacyKey = await deriveKey(passphrase, saltBytes, LEGACY_ITERATIONS);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();

    const cipherBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      legacyKey,
      enc.encode(plainText)
    );

    const cipherBytes = new Uint8Array(cipherBuf);
    const legacyPayload = new Uint8Array(12 + cipherBytes.length);
    legacyPayload.set(iv, 0);
    legacyPayload.set(cipherBytes, 12);

    const legacyB64 = bytesToBase64(legacyPayload);

    // Now test decryptText on this legacy payload
    const decrypted = await decryptText(legacyB64, passphrase, salt);
    expect(decrypted).toBe(plainText);
  });

  it('fails decryption when passphrase is wrong', async () => {
    const salt = generateSalt();
    const plainText = 'Top Secret Paper';

    const cipher = await encryptText(plainText, passphrase, salt);
    await expect(decryptText(cipher, 'WrongPassphrase!', salt)).rejects.toThrow();
  });
});
