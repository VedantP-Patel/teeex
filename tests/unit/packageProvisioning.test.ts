import { describe, it, expect, vi } from 'vitest';
import {
  validatePackagePayload,
  validatePackageAgainstManifest,
  readResponseLimited,
  provisionPackages,
  computeSha256,
  MAX_PACKAGE_SIZE,
  MIN_PACKAGE_SIZE,
} from '../../scripts/download-essential-packages.mjs';

function createMockResponse({
  headers = {},
  chunks = [],
}: {
  headers?: Record<string, string>;
  chunks?: Uint8Array[];
}) {
  let chunkIndex = 0;
  const headerMap = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));

  const stream = new ReadableStream({
    pull(controller) {
      if (chunkIndex < chunks.length) {
        controller.enqueue(chunks[chunkIndex++]);
      } else {
        controller.close();
      }
    },
  });

  return {
    headers: {
      get: (k: string) => headerMap.get(k.toLowerCase()) ?? null,
    },
    body: stream,
  } as unknown as Response;
}

describe('Stage 2: Package Provisioning & Cryptographic Integrity', () => {
  describe('readResponseLimited (Streaming Bounds)', () => {
    it('rejects responses whose advertised Content-Length exceeds 8 MiB before reading body', async () => {
      const oversizedLen = (8 * 1024 * 1024 + 1).toString();
      const mockRes = createMockResponse({
        headers: { 'Content-Length': oversizedLen },
        chunks: [new Uint8Array([1, 2, 3])],
      });

      await expect(
        readResponseLimited(mockRes, 8 * 1024 * 1024)
      ).rejects.toThrow(/Content-Length.*exceeds limit/i);
    });

    it('cancels reading immediately when accumulated body exceeds 8 MiB during streaming', async () => {
      const chunk1 = new Uint8Array(4 * 1024 * 1024); // 4 MiB
      const chunk2 = new Uint8Array(5 * 1024 * 1024); // 5 MiB -> 9 MiB total
      const mockRes = createMockResponse({
        chunks: [chunk1, chunk2],
      });

      await expect(
        readResponseLimited(mockRes, 8 * 1024 * 1024)
      ).rejects.toThrow(/exceeded limit.*while streaming/i);
    });

    it('returns complete bytes after body has finished within limit', async () => {
      const chunk1 = new TextEncoder().encode('\\ProvidesPackage{test}');
      const chunk2 = new TextEncoder().encode('[2026/01/01]');
      const mockRes = createMockResponse({
        chunks: [chunk1, chunk2],
      });

      const result = await readResponseLimited(mockRes, 8 * 1024 * 1024);
      expect(result.toString('utf8')).toBe('\\ProvidesPackage{test}[2026/01/01]');
    });
  });

  describe('Manifest Integrity Verification (validatePackageAgainstManifest)', () => {
    const validSample = Buffer.from('\\ProvidesPackage{sample}[2026/01/01 Sample]\n');
    const mockManifest = {
      'sample.sty': {
        bytes: validSample.length,
        sha256: computeSha256(validSample),
      },
    };

    it('accepts package whose byte count and SHA-256 match manifest', () => {
      const res = validatePackageAgainstManifest('sample.sty', validSample, mockManifest);
      expect(res.valid).toBe(true);
    });

    it('rejects package when byte count does not match manifest', () => {
      const tamperedBuf = Buffer.from('\\ProvidesPackage{sample}[2026/01/01 Sample]\nEXTRA');
      const res = validatePackageAgainstManifest('sample.sty', tamperedBuf, mockManifest);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Byte count mismatch');
    });

    it('rejects package when SHA-256 digest does not match manifest (hash mismatch)', () => {
      // Same byte length but altered content
      const alteredBuf = Buffer.from('\\ProvidesPackage{sample}[2026/01/01 Xample]\n');
      expect(alteredBuf.length).toBe(validSample.length);

      const res = validatePackageAgainstManifest('sample.sty', alteredBuf, mockManifest);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('SHA-256 digest mismatch');
    });

    it('rejects packages not registered in the manifest', () => {
      const unlistedBuf = Buffer.from('\\ProvidesPackage{unlisted}[2026/01/01 Unlisted]\n');
      const res = validatePackageAgainstManifest('unlisted.sty', unlistedBuf, mockManifest);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('not registered in integrity manifest');
    });
  });

  describe('Concurrency Configuration Validation', () => {
    it('rejects invalid concurrency values (< 1, > 16, non-integer)', async () => {
      await expect(provisionPackages({ concurrency: 0 })).rejects.toThrow(/Invalid concurrency "0"/);
      await expect(provisionPackages({ concurrency: -5 })).rejects.toThrow(/Invalid concurrency "-5"/);
      await expect(provisionPackages({ concurrency: 20 })).rejects.toThrow(/Invalid concurrency "20"/);
      await expect(provisionPackages({ concurrency: 2.5 as any })).rejects.toThrow(/Invalid concurrency/);
      await expect(provisionPackages({ concurrency: NaN as any })).rejects.toThrow(/Invalid concurrency/);
    });
  });

  describe('HTML and Upstream Error Rejection', () => {
    it('rejects HTML error content served with misleading binary payload', () => {
      const htmlPayload = Buffer.from(
        '<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><h1>404 Not Found</h1></body></html>'
      );
      const result = validatePackagePayload('booktabs.sty', htmlPayload);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('HTML error response detected');
    });

    it('rejects explicit upstream server error text', () => {
      const errorText = Buffer.from('Cannot GET /26/titlesec.sty\nUpstream 404 Not Found\n');
      const result = validatePackagePayload('titlesec.sty', errorText);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Explicit upstream error text detected');
    });

    it('rejects AWS/Cloudflare XML/text NoSuchKey or Access Denied errors', () => {
      const accessDenied = Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Error><Code>Access Denied</Code></Error>');
      const result = validatePackagePayload('environ.sty', accessDenied);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Explicit upstream error text detected');
    });
  });

  describe('Size Boundaries', () => {
    it('rejects empty or null payload', () => {
      const result = validatePackagePayload('test.sty', Buffer.from(''));
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Undersized');
    });

    it(`rejects payloads smaller than MIN_PACKAGE_SIZE (${MIN_PACKAGE_SIZE} bytes)`, () => {
      const tiny = Buffer.from('\\def\\a{1}'); // 9 bytes
      const result = validatePackagePayload('tiny.sty', tiny);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain(`Undersized payload (${tiny.length} bytes < ${MIN_PACKAGE_SIZE} bytes)`);
    });

    it('rejects payloads exceeding the 8 MiB size limit', () => {
      const oversized = {
        length: MAX_PACKAGE_SIZE + 1,
        toString: () => '\\ProvidesPackage{large}',
      };

      const result = validatePackagePayload('huge.sty', oversized as any);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Oversized payload');
    });
  });

  describe('Embedded NUL Byte Guard', () => {
    it('rejects text packages containing embedded NUL bytes', () => {
      const corrupted = Buffer.from('\\ProvidesPackage{test}[2026/01/01]\x00\\def\\corrupted{true}');
      const result = validatePackagePayload('corrupt.sty', corrupted);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Embedded NUL byte detected');
    });
  });

  describe('TeX Style and Class Source Markers', () => {
    it('accepts modern style files with \\ProvidesPackage and \\NeedsTeXFormat', () => {
      const modernStyle = Buffer.from(
        '% Modern LaTeX package\n\\NeedsTeXFormat{LaTeX2e}\n\\ProvidesPackage{booktabs}[2020/05/08 v1.00 Academic publication tables]\n\\RequirePackage{array}\n'
      );
      const result = validatePackagePayload('booktabs.sty', modernStyle);

      expect(result.valid).toBe(true);
      expect(result.reason).toBe('Valid TeX style/class');
    });

    it('accepts legacy style files with direct macro definitions (\\def, \\catcode, \\makeatletter)', () => {
      const legacyStyle = Buffer.from(
        '% Legacy style definitions\n\\catcode`\\@=11\n\\def\\legacytable#1{\\begingroup#1\\endgroup}\n\\let\\oldlegacy=\\legacytable\n\\catcode`\\@=12\n'
      );
      const result = validatePackagePayload('legacy.sty', legacyStyle);

      expect(result.valid).toBe(true);
      expect(result.reason).toBe('Valid TeX style/class');
    });

    it('accepts document classes (.cls) with \\ProvidesClass', () => {
      const clsPayload = Buffer.from(
        '\\NeedsTeXFormat{LaTeX2e}\n\\ProvidesClass{sn-jnl}[2023/05/01 Springer Nature Journal]\n\\DeclareOption*{\\PassOptionsToClass{\\CurrentOption}{article}}\n\\ProcessOptions\\relax\n'
      );
      const result = validatePackagePayload('sn-jnl.cls', clsPayload);

      expect(result.valid).toBe(true);
      expect(result.reason).toBe('Valid TeX style/class');
    });

    it('rejects style files missing all expected TeX markers', () => {
      const invalidStyle = Buffer.from(
        'Plain english text without any latex macro backslashes or percent comments whatsoever in this file.'
      );
      const result = validatePackagePayload('invalid.sty', invalidStyle);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Missing expected TeX source markers');
    });
  });

  describe('BibTeX Style (.bst) Markers', () => {
    it('accepts valid BibTeX styles containing ENTRY and FUNCTION blocks', () => {
      const bstPayload = Buffer.from(
        '% BibTeX standard bibliography style\nENTRY\n  { address\n    author\n    title\n  }\n  {}\n  { label }\nFUNCTION {output.bibitem}\n{\n  newline$\n}\nREAD\n'
      );
      const result = validatePackagePayload('ACM-Reference-Format.bst', bstPayload);

      expect(result.valid).toBe(true);
      expect(result.reason).toBe('Valid BibTeX style');
    });

    it('rejects .bst files lacking required BibTeX markers', () => {
      const invalidBst = Buffer.from(
        'This is not a valid BibTeX style file and has no entry functions or grammar definitions.'
      );
      const result = validatePackagePayload('invalid.bst', invalidBst);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Missing expected BibTeX style markers');
    });
  });
});
