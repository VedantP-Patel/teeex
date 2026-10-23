import { describe, it, expect } from 'vitest';
import { sha256, sha256Sync } from '../../src/services/shareSecurityService';

describe('SHA-256 Integrity & Non-ASCII Unicode Support', () => {
  // NIST standard test vector: SHA-256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
  it('correctly computes NIST standard SHA-256 for basic ASCII strings', async () => {
    const input = 'abc';
    const expected = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

    const asyncHash = await sha256(input);
    const syncHash = sha256Sync(input);

    expect(asyncHash).toBe(expected);
    expect(syncHash).toBe(expected);
  });

  // NIST standard test vector for empty string
  it('correctly hashes an empty string', async () => {
    const expected = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

    expect(await sha256('')).toBe(expected);
    expect(sha256Sync('')).toBe(expected);
  });

  it('preserves full UTF-8 Unicode fidelity for non-ASCII input (accents, math symbols, emoji)', async () => {
    const testCases = [
      'Dr. René Descartes',
      'Schrödinger equation: iℏ ∂/∂t |ψ⟩ = Ĥ |ψ⟩',
      'EUR cost: €1,500 and JPY cost: ¥200,000',
      'Chinese document: 量子计算与拓扑学',
      'Unicode with emojis: 🚀 LaTeX High-Speed Engine ✨',
    ];

    for (const text of testCases) {
      const asyncHash = await sha256(text);
      const syncHash = sha256Sync(text);

      expect(asyncHash.length).toBe(64);
      expect(syncHash.length).toBe(64);
      // Both implementations must produce identical cryptographic hashes
      expect(syncHash).toBe(asyncHash);

      // Verify that code > 255 does not produce the same hash as the masked code & 0xff:
      // '€' (0x20AC) masked with & 0xff is 0xAC ('¬')
      // If text were masked with & 0xff, '€' and '¬' would produce identical hashes
      const corruptedText = text.replace(/€/g, '\xAC');
      if (text.includes('€')) {
        const corruptedHash = await sha256(corruptedText);
        expect(asyncHash).not.toBe(corruptedHash);
      }
    }
  });

  it('generates unguessable room capability tokens with correct ladder', async () => {
    const roomId = 'room_algebra_101';
    const editToken = 'ed_4a2f8c9b1e0d7a6b5c4d3e2f1a0b9c8d';

    const viewHash = await sha256(`${roomId}:${editToken}`);
    const viewToken = `vw_${viewHash.slice(0, 24)}`;

    expect(viewToken).toMatch(/^vw_[0-9a-f]{24}$/);
    expect(viewToken.length).toBe(27); // 'vw_' (3) + 24 hex = 27
  });
});
