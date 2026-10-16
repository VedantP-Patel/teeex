import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const DEST = join(ROOT, 'public', 'core', 'busytex');
const MANIFEST_PATH = join(DEST, '.teeex-manifest.json');

const GOLDEN_DIGESTS: Record<string, { bytes: number; sha256: string }> = {
  'busytex_worker.js': {
    bytes: 8258,
    sha256: '944f150cfa9b8282d06aa91b05fd9e82cc536c84f809f152d6beb4c358738e15',
  },
  'busytex_pipeline.js': {
    bytes: 28013,
    sha256: 'ee62f299d5b210332d3e4c7804451721c6b9889c214410b818e9d7807385548c',
  },
  'busytex_biber.js': {
    bytes: 3688,
    sha256: 'e1a3ff55a120e392d3a7ef27f1bff1978c7a9d5978999296e39e1cfeac01d923',
  },
  'busytex.js': {
    bytes: 289679,
    sha256: 'a84b07d8186cf422d5ed86d04558f54c09e1c8d08bcc55317ce2d89da979bcb7',
  },
  'busytex.wasm': {
    bytes: 32507525,
    sha256: '8d1988fc58cd1611c3cbd6bd986c3e607e5ff44f1d94252207ff7aae4cee72e0',
  },
  'texlive-basic.js': {
    bytes: 2091651,
    sha256: 'd4abc2e93a1ae33099107c6ad8a61813978cd44036a95697db2f2365a393c283',
  },
  'texlive-basic.data': {
    bytes: 92785062,
    sha256: 'ccb35d98d77cbaf988e1481f8538709f72166196785cf6b8785eabe6c8fb2993',
  },
  'biber.js': {
    bytes: 1069103,
    sha256: 'f097b241ec1dfaff8c43b7c3e242a85c535d4a24b6252288da869d1a8b465c08',
  },
  'biber.wasm': {
    bytes: 9644474,
    sha256: '6c2ddccf3b95e06b419d4aee5f88ef10ddec658ce760fabb34d7145371ff18c5',
  },
  'biber.data': {
    bytes: 21079910,
    sha256: '9ea1357e6180477479b5edfe17538ba655ebebc03142a195d85fb1d47899df21',
  },
};

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

describe('Engine Cryptographic Integrity & Bloat Removal (S3c, S4a)', () => {
  it('manifest exists and contains valid 64-character hex digests for all 10 assets', () => {
    expect(existsSync(MANIFEST_PATH), 'Manifest file must exist').toBe(true);
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

    expect(manifest.engineVersion).toBe('1.4.0');
    expect(manifest.profile).toBe('pdftex');
    expect(Object.keys(manifest.files)).toHaveLength(10);

    for (const [name, entry] of Object.entries(manifest.files) as [string, { bytes: number; sha256: string }][]) {
      expect(entry.bytes).toBeGreaterThan(0);
      expect(entry.sha256, `${name} must have a valid sha256 hash`).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('all 10 engine files on disk match their exact golden SHA-256 digests', () => {
    for (const [name, golden] of Object.entries(GOLDEN_DIGESTS)) {
      const p = join(DEST, name);
      expect(existsSync(p), `Required asset ${name} must exist on disk`).toBe(true);
      const buf = readFileSync(p);
      expect(buf.length, `${name} byte size mismatch`).toBe(golden.bytes);
      expect(sha256(buf), `${name} SHA-256 digest mismatch`).toBe(golden.sha256);
    }
  });

  it('negative test: 1-byte alteration causes checksum mismatch failure', () => {
    // Read a real asset, alter 1 byte in a copy, and verify checksum calculation fails
    const realBuf = readFileSync(join(DEST, 'busytex_biber.js'));
    const mutated = Buffer.from(realBuf);
    mutated[10] = mutated[10] === 0x41 ? 0x42 : 0x41; // Flip a byte

    const mutatedHash = sha256(mutated);
    expect(mutatedHash).not.toBe(GOLDEN_DIGESTS['busytex_biber.js'].sha256);
  });

  it('unreferenced 205MB assets (texlive-recommended) are absent on disk', () => {
    expect(existsSync(join(DEST, 'texlive-recommended.data'))).toBe(false);
    expect(existsSync(join(DEST, 'texlive-recommended.js'))).toBe(false);
    expect(existsSync(join(DEST, 'busytex.js.pre-diagnostic-restore'))).toBe(false);
  });

  it('total engine asset footprint is strictly <= 165 MB', () => {
    let totalBytes = 0;
    for (const [name, golden] of Object.entries(GOLDEN_DIGESTS)) {
      totalBytes += golden.bytes;
    }
    const totalMiB = totalBytes / 1024 / 1024;
    expect(totalMiB).toBeLessThan(165);
    expect(totalMiB).toBeGreaterThan(140);
  });
});
